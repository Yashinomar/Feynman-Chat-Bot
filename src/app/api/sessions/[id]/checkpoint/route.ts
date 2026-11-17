import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiError, ApiError, readJson, requireUser } from '@/lib/api';
import { generateJson, textSchema } from '@/lib/ai';
import {
  checkpointAnalysisSchema,
  checkpointReportInstruction,
  checkpointReportSchema,
  parseCheckpointReport,
} from '@/lib/checkpoint-report';
import { parseLearningPath } from '@/lib/learning-path';
import { levelSchema } from '@/lib/ai';

export const runtime = 'nodejs';

const inputSchema = z.object({
  content: textSchema,
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
}).strict();
const withMessages = { messages: { orderBy: { sequence: 'asc' as const } } };
type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Context) {
  try {
    const user = await requireUser(req, 'chat', 10, 60_000);
    const input = inputSchema.parse(await readJson(req, 131_072));
    const { id } = await params;
    const session = await prisma.session.findFirst({ where: { id, userId: user.id }, include: withMessages });
    if (!session) throw new ApiError(404, 'Session not found.');

    const previousUser = session.messages.find(message => message.requestId === input.requestId && message.role === 'user');
    if (previousUser) {
      if (previousUser.content !== input.content) throw new ApiError(409, 'This request was already used for a different checkpoint answer.');
      const previousReply = session.messages.find(message => message.requestId === input.requestId && message.role === 'ai');
      const report = parseCheckpointReport(session.checkpointReport);
      if (!previousReply || !report || report.requestId !== input.requestId || session.status !== 'completed') {
        throw new ApiError(409, 'This checkpoint submission could not be recovered. Reload the session before continuing.');
      }
      return NextResponse.json({ session, report, replayed: true });
    }

    if (session.version !== input.expectedVersion) throw new ApiError(409, 'The session changed in another tab. Reload it before submitting the checkpoint.');
    if (session.status !== 'checkpoint') throw new ApiError(409, 'Complete the learning path before submitting the Feynman checkpoint.');
    if (session.checkpointReport !== null) throw new ApiError(409, 'This checkpoint already has a saved report.');
    if (!session.learningPath) throw new ApiError(409, 'The saved learning path is unavailable. Complete the learning path before submitting the checkpoint.');

    const level = levelSchema.catch('highschool').parse(session.studentLevel);
    const path = parseLearningPath(session.learningPath, { topic: session.topic, level });
    if (!path) throw new ApiError(409, 'The saved learning path is unavailable. Complete the learning path before submitting the checkpoint.');
    if (session.pathIndex !== path.length - 1 || (!session.courseCheckpointKey && session.masteryScore !== 100)) {
      throw new ApiError(409, 'Complete every learning step before submitting the Feynman checkpoint.');
    }

    const analysis = await generateJson(
      checkpointReportInstruction(path.length),
      [{ role: 'user', content: JSON.stringify({ topic: session.topic, learningPath: path, courseMaterial: session.courseContext, explanation: input.content }) }],
      checkpointAnalysisSchema,
      3000,
    );
    if (analysis.firstReview.stepIndex >= path.length) throw new ApiError(502, 'The AI returned an invalid review step. Nothing was saved; please try again.');
    const report = checkpointReportSchema.parse({
      ...analysis,
      schemaVersion: 1,
      requestId: input.requestId,
      generatedAt: new Date().toISOString(),
    });
    const sequence = (session.messages.at(-1)?.sequence ?? -1) + 1;

    const saved = await prisma.$transaction(async transaction => {
      const update = await transaction.session.updateMany({
        where: { id: session.id, userId: user.id, version: input.expectedVersion, status: 'checkpoint', checkpointReport: null },
        data: { status: 'completed', checkpointReport: JSON.stringify(report), version: { increment: 1 }, activeCorrection: null },
      });
      if (update.count !== 1) throw new ApiError(409, 'The session changed while the report was being prepared. Reload before trying again.');
      await transaction.message.createMany({ data: [
        { sessionId: session.id, role: 'user', content: input.content, requestId: input.requestId, sequence },
        { sessionId: session.id, role: 'ai', content: report.summary, requestId: input.requestId, sequence: sequence + 1 },
      ] });
      return transaction.session.findUniqueOrThrow({ where: { id: session.id }, include: withMessages });
    });
    return NextResponse.json({ session: saved, report });
  } catch (error) {
    return apiError(error);
  }
}
