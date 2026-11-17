import { prisma } from '@/lib/prisma';
import { apiError, requireUser } from '@/lib/api';
import { courseContentSchema } from '@/lib/course-content';

export async function GET(req: Request) {
  try {
    await requireUser(req);
    const rows = await prisma.course.findMany({ where: { published: { not: null } }, orderBy: { updatedAt: 'desc' }, select: { id: true, published: true } });
    return Response.json(rows.map(row => ({ id: row.id, content: courseContentSchema.parse(JSON.parse(row.published!)) })));
  } catch (error) { return apiError(error); }
}
