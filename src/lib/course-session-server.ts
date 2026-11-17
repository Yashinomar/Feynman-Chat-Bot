import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { ApiError } from './api';
import { courseContentSchema } from './course-content';
import { flattenSessions } from './course-sessions';
import { starterCourse } from './starter-course';

export const sessionRevision = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const checkpointKey = (courseId: string, block: number, group: ReturnType<typeof flattenSessions>) => sessionRevision({ courseId, block, group });
export async function loadCourse(id: string) {
  if (id === starterCourse.id) return starterCourse.content;
  const row = await prisma.course.findFirst({ where: { id, published: { not: null } } });
  if (!row) throw new ApiError(404, 'This course is no longer available. Return to your learning path.');
  return courseContentSchema.parse(JSON.parse(row.published!));
}
export async function courseSessionState(userId: string, courseId: string) {
  const course = await loadCourse(courseId);
  const sessions = flattenSessions(course);
  const saved = await prisma.courseReadingProgress.findMany({ where: { userId, courseId } });
  const completed = sessions.filter(session => saved.some(row => row.lessonId === session.id && row.revision === sessionRevision(session))).map(session => session.id);
  const keys = Array.from({ length: Math.floor(sessions.length / 5) }, (_, block) => checkpointKey(courseId, block, sessions.slice(block * 5, block * 5 + 5)));
  const savedCheckpoints = await prisma.session.findMany({ where: { userId, courseCheckpointKey: { in: keys } }, select: { id: true, status: true, courseCheckpointKey: true } });
  const checkpoints = keys.map((key, block) => { const saved = savedCheckpoints.find(item => item.courseCheckpointKey === key); return { block, id: saved?.id ?? null, status: saved?.status ?? 'locked' }; });
  return { course, sessions, completed, checkpoints };
}
