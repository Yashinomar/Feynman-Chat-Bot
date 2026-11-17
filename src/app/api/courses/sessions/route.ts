import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, readJson, requireUser } from '@/lib/api';
import { courseSessionState, sessionRevision } from '@/lib/course-session-server';
import { isCorrectAnswer } from '@/lib/course-sessions';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const courseId = z.string().min(1).max(100).parse(new URL(req.url).searchParams.get('courseId'));
    const state = await courseSessionState(user.id, courseId);
    return Response.json({ completed: state.completed, revisions: Object.fromEntries(state.sessions.map(session => [session.id, sessionRevision(session)])), checkpoints: state.checkpoints });
  } catch (error) { return apiError(error); }
}
const inputSchema = z.object({ courseId: z.string().min(1).max(100), sessionId: z.string().uuid(), revision: z.string().length(64), answer: z.array(z.string().uuid()).max(6) }).strict();
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const input = inputSchema.parse(await readJson(req, 4096));
    const { sessions, completed, checkpoints } = await courseSessionState(user.id, input.courseId);
    const index = sessions.findIndex(session => session.id === input.sessionId);
    if (index < 0) throw new ApiError(404, 'Session not found. Reload the learning path.');
    const session = sessions[index];
    if (input.revision !== sessionRevision(session)) throw new ApiError(409, 'This session has been updated. Return to the path and reload before continuing.');
    if (sessions.slice(0, index).some(item => !completed.includes(item.id))) throw new ApiError(409, 'Finish the earlier sessions first.');
    if (checkpoints.some(checkpoint => checkpoint.block < Math.floor(index / 5) && checkpoint.status !== 'completed')) throw new ApiError(409, 'Complete the Feynman checkpoint before starting the next five sessions.');
    if (!isCorrectAnswer(session.quiz, input.answer)) throw new ApiError(400, 'Revisit the example and try the quiz again.');
    await prisma.courseReadingProgress.upsert({ where: { userId_courseId_lessonId: { userId: user.id, courseId: input.courseId, lessonId: session.id } }, create: { userId: user.id, courseId: input.courseId, lessonId: session.id, revision: input.revision }, update: { revision: input.revision, completedAt: new Date() } });
    return Response.json({ completed: [...new Set([...completed, session.id])] });
  } catch (error) { return apiError(error); }
}
