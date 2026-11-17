import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, readJson, requireUser } from '@/lib/api';
import { checkpointKey, courseSessionState } from '@/lib/course-session-server';

const inputSchema = z.object({ courseId: z.string().min(1).max(100), block: z.number().int().min(0).max(119) }).strict();
export async function POST(req: Request) {
  try {
    const user = await requireUser(req, 'course-checkpoint', 15);
    const input = inputSchema.parse(await readJson(req, 4096));
    const { course, sessions, completed } = await courseSessionState(user.id, input.courseId);
    const group = sessions.slice(input.block * 5, input.block * 5 + 5);
    if (group.length !== 5 || group.some(session => !completed.includes(session.id))) throw new ApiError(409, 'Complete all five sessions to unlock this checkpoint.');
    const key = checkpointKey(input.courseId, input.block, group);
    const learningPath = group.map(session => ({ title: session.title.slice(0, 80).padEnd(3, '.'), objective: `Explain ${session.title} and connect it to ${session.topicTitle}.`.slice(0, 220) }));
    const session = await prisma.$transaction(async tx => {
      const existing = await tx.session.findUnique({ where: { userId_courseCheckpointKey: { userId: user.id, courseCheckpointKey: key } } });
      if (existing) return existing;
      if (await tx.session.count({ where: { userId: user.id } }) >= 200) throw new ApiError(409, 'Your practice library is full. Remove an old session before starting a checkpoint.');
      return tx.session.create({ data: { userId: user.id, topic: `${course.title} · Checkpoint ${input.block + 1}`, studentLevel: course.level, status: 'checkpoint', pathIndex: 4, masteryScore: 0, learningPath: JSON.stringify(learningPath), courseCheckpointKey: key, courseContext: JSON.stringify({ courseId: input.courseId, sessions: group }) } });
    });
    return Response.json({ id: session.id });
  } catch (error) { return apiError(error); }
}
