import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, readJson, requireUser } from '@/lib/api';
import { courseContentSchema } from '@/lib/course-content';
import { starterCourse } from '@/lib/starter-course';
import { lessonRevision } from '@/lib/course-progress';

const inputSchema = z.object({ courseId: z.string().min(1).max(100), lessonId: z.string().uuid() }).strict();
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const [progress, published] = await Promise.all([
      prisma.courseReadingProgress.findMany({ where: { userId: user.id }, select: { courseId: true, lessonId: true, revision: true } }),
      prisma.course.findMany({ where: { published: { not: null } }, select: { id: true, published: true } }),
    ]);
    const courses = [starterCourse, ...published.map(row => ({ id: row.id, content: courseContentSchema.parse(JSON.parse(row.published!)) }))];
    return Response.json(progress.filter(row => {
      const lesson = courses.find(course => course.id === row.courseId)?.content.lessons.find(item => item.id === row.lessonId);
      return lesson && row.revision === lessonRevision(lesson);
    }));
  } catch (error) { return apiError(error); }
}
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const input = inputSchema.parse(await readJson(req, 4096));
    const record = input.courseId === starterCourse.id ? null : await prisma.course.findFirst({ where: { id: input.courseId, published: { not: null } } });
    const course = input.courseId === starterCourse.id ? starterCourse.content : record ? courseContentSchema.parse(JSON.parse(record.published!)) : null;
    const lesson = course?.lessons.find(item => item.id === input.lessonId);
    if (!lesson) throw new ApiError(404, 'This lesson is no longer available. Reload your learning path.');
    const revision = lessonRevision(lesson);
    const saved = await prisma.courseReadingProgress.upsert({
      where: { userId_courseId_lessonId: { userId: user.id, ...input } },
      create: { userId: user.id, ...input, revision }, update: { revision, completedAt: new Date() },
      select: { courseId: true, lessonId: true, revision: true },
    });
    return Response.json(saved);
  } catch (error) { return apiError(error); }
}
