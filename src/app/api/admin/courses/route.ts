import { prisma } from '@/lib/prisma';
import { ApiError, apiError, readJson, requireUser } from '@/lib/api';
import { courseContentSchema, courseWriteSchema, publicationProblem } from '@/lib/course-content';

export const runtime = 'nodejs';
async function authorize(req: Request) {
  const user = await requireUser(req, 'admin-content');
  if (user.role !== 'ADMIN') throw new ApiError(403, 'Administrator access is required.');
}
function serialize(row: { id: string; draft: string; version: number; published: string | null; updatedAt: Date }) {
  return { id: row.id, content: courseContentSchema.parse(JSON.parse(row.draft)), version: row.version, published: row.published !== null, updatedAt: row.updatedAt.toISOString() };
}
export async function GET(req: Request) {
  try {
    await authorize(req);
    return Response.json((await prisma.course.findMany({ orderBy: { updatedAt: 'desc' } })).map(serialize));
  } catch (error) { return apiError(error); }
}
export async function PUT(req: Request) {
  try {
    await authorize(req);
    const input = courseWriteSchema.parse(await readJson(req, 2_000_000));
    if (input.action === 'publish') {
      const problem = publicationProblem(input.content);
      if (problem) throw new ApiError(400, problem);
    }
    const draft = JSON.stringify(input.content);
    const saved = await prisma.$transaction(async tx => {
      const current = await tx.course.findUnique({ where: { id: input.id } });
      if (!current) {
        if (input.expectedVersion !== -1) throw new ApiError(409, 'This course is unavailable. Reload the course list.');
        return tx.course.create({ data: { id: input.id, title: input.content.title, draft, published: input.action === 'publish' ? draft : null } });
      }
      // Safe recovery after a lost response, without overwriting intervening edits.
      if (current.draft === draft && current.version === input.expectedVersion + 1 &&
        (input.action === 'save' || (input.action === 'publish' ? current.published === draft : current.published === null))) return current;
      const result = await tx.course.updateMany({ where: { id: input.id, version: input.expectedVersion }, data: {
        title: input.content.title, draft, version: { increment: 1 },
        ...(input.action === 'publish' ? { published: draft } : input.action === 'unpublish' ? { published: null } : {}),
      } });
      if (!result.count) throw new ApiError(409, 'Another editor changed this course. Your draft is kept; reload the course before merging changes.');
      return tx.course.findUniqueOrThrow({ where: { id: input.id } });
    });
    return Response.json(serialize(saved));
  } catch (error) { return apiError(error); }
}
