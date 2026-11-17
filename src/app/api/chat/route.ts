import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiError, ApiError, readJson, requireUser } from '@/lib/api';
import { embedTexts, evaluationSchema, generateJson, messageSchema, textSchema } from '@/lib/ai';
import { rankPassages, type NoteSource } from '@/lib/rag';
import { calculateNextReview, tutorInstruction } from '@/lib/study';
import { advancePath, legacyLearningPath, parseLearningPath } from '@/lib/learning-path';
import { levelSchema } from '@/lib/ai';
import { requireRoomMember } from '@/lib/signaling';

export const runtime = 'nodejs';

const soloSchema = z.object({
  sessionId: z.string().uuid(),
  content: textSchema,
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
}).strict();
const multiplayerSchema = z.object({
  roomId: z.string().min(20).max(100),
  messages: z.array(messageSchema).min(1).max(20),
  requestId: z.string().uuid().optional(),
}).strict();
const inputSchema = z.union([soloSchema, multiplayerSchema]);
const withMessages = { messages: { orderBy: { sequence: 'asc' as const } } };

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, 'chat', 10, 60000);
    const input = inputSchema.parse(await readJson(req, 131072));
    if ('roomId' in input) {
      const room = await requireRoomMember(input.roomId, user.id);
      if (room.hostId !== user.id) throw new ApiError(403, 'Only the host can request the multiplayer tutor.');
      if (input.messages.at(-1)?.role !== 'user') throw new ApiError(400, 'End the conversation with a student message.');
      const evaluation = await generateJson(tutorInstruction(room, [], room.gameMode), input.messages, evaluationSchema);
      return NextResponse.json({ ...evaluation, sources: [] });
    }

    const session = await prisma.session.findFirst({
      where: { id: input.sessionId, userId: user.id },
      include: withMessages,
    });
    if (!session) throw new ApiError(404, 'Session not found.');
    const previousUser = session.messages.find(message => message.requestId === input.requestId && message.role === 'user');
    if (previousUser) {
      if (previousUser.content !== input.content) throw new ApiError(409, 'This request was already used for a different message.');
      const previousReply = session.messages.find(message => message.requestId === input.requestId && message.role === 'ai');
      if (!previousReply) throw new ApiError(409, 'This turn could not be recovered. Reload the session before continuing.');
      return NextResponse.json({ session, reply: previousReply.content, score: session.masteryScore, sources: [], replayed: true });
    }
    if (session.version !== input.expectedVersion) throw new ApiError(409, 'The session changed in another tab. Reload it before sending this message.');
    if (session.status !== 'active') {
      throw new ApiError(409, session.status === 'checkpoint'
        ? 'Your learning path is complete. Submit the Feynman checkpoint to continue.'
        : 'This session is completed. Start a new study session to keep practicing.');
    }
    if (session.messages.length >= 500) throw new ApiError(409, 'This session has reached its message limit. Start a new study session.');

    let sources: NoteSource[] = [];
    if (session.isRagSession) {
      const passages = await prisma.noteChunk.findMany({ where: { sessionId: session.id }, orderBy: { position: 'asc' }, take: 61 });
      if (!passages.length) throw new ApiError(503, 'The notes for this session are unavailable. Please upload them again.');
      const [query] = await embedTexts([input.content]);
      sources = rankPassages(query, passages);
    }
    const level = levelSchema.catch('highschool').parse(session.studentLevel);
    const path = parseLearningPath(session.learningPath, { topic: session.topic, level }) ?? legacyLearningPath(session.topic, level);
    const stage = Math.min(Math.max(session.pathIndex, 0), path.length - 1);
    const history = session.messages.slice(-10).map(message => messageSchema.parse({ role: message.role, content: message.content }));
    history.push({ role: 'user', content: input.content });
    const evaluation = await generateJson(tutorInstruction(session, sources, 'classic', { steps: path, index: stage }), history, evaluationSchema);
    const progress = advancePath(stage, path, evaluation.score, evaluation.stepComplete);
    const reply = progress.complete
      ? progress.allComplete
        ? `You have completed the learning path for ${session.topic}. Your Feynman checkpoint is ready.`
        : `You have explained ${path[stage].title} clearly. Next, ${path[progress.nextIndex].objective}`
      : evaluation.reply;
    const review = calculateNextReview(progress.masteryScore, session.repetition, session.efactor, session.interval);
    const sequence = (session.messages.at(-1)?.sequence ?? -1) + 1;
    // The score, review schedule, and both messages commit together. Version guards reject concurrent turns.
    const saved = await prisma.$transaction(async transaction => {
      const update = await transaction.session.updateMany({
        where: { id: session.id, userId: user.id, version: input.expectedVersion },
        data: { masteryScore: progress.masteryScore, ...review, learningPath: JSON.stringify(path), pathIndex: progress.nextIndex, status: progress.allComplete ? 'checkpoint' : session.status, version: { increment: 1 }, activeCorrection: null },
      });
      if (update.count !== 1) throw new ApiError(409, 'The session changed while the tutor was replying. Reload before trying again.');
      await transaction.message.createMany({ data: [
        { sessionId: session.id, role: 'user', content: input.content, requestId: input.requestId, sequence },
        { sessionId: session.id, role: 'ai', content: reply, requestId: input.requestId, sequence: sequence + 1 },
      ] });
      return transaction.session.findUniqueOrThrow({ where: { id: session.id }, include: withMessages });
    });
    return NextResponse.json({ session: saved, reply, score: progress.masteryScore, sources });
  } catch (error) {
    return apiError(error);
  }
}
