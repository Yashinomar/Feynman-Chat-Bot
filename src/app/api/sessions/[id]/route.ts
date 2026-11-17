import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, readJson, requireUser } from '@/lib/api';
import { updateSessionSchema } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const session = await prisma.session.findFirst({ where: { id, userId: user.id }, include: { messages: { orderBy: { sequence: 'asc' } } } });
    if (!session) throw new ApiError(404, 'Session not found.');
    return NextResponse.json(session);
  } catch (error) { return apiError(error); }
}
export async function DELETE(req: Request, { params }: Context) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const result = await prisma.session.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) throw new ApiError(404, 'Session not found.');
    return NextResponse.json({ success: true });
  } catch (error) { return apiError(error); }
}
export async function PUT(req: Request, { params }: Context) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const updates = updateSessionSchema.parse(await readJson(req, 4096));
    const owner = { id, userId: user.id };
    const withMessages = { messages: { orderBy: { sequence: 'asc' as const } } };
    const current = await prisma.session.findFirst({
      where: owner,
      include: { ...withMessages, _count: { select: { noteChunks: true } } },
    });
    if (!current) throw new ApiError(404, 'Session not found.');

    const { _count, ...snapshot } = current;
    if (updates.status !== undefined && updates.status !== snapshot.status) {
      throw new ApiError(409, 'Session status changes when you finish the learning path.');
    }

    const rename = updates.topic !== undefined && updates.topic !== snapshot.topic;
    const dismiss = updates.activeCorrection === null;
    if (dismiss && updates.expectedVersion !== snapshot.version) {
      throw new ApiError(409, 'The session changed. Reload it before dismissing this correction.');
    }
    if (rename && (
      snapshot.status !== 'active' || snapshot.learningPath !== null || snapshot.isRagSession || _count.noteChunks > 0 ||
      snapshot.messages.length > 0 || snapshot.masteryScore !== 0 || snapshot.pathIndex !== 0 ||
      snapshot.reviewDate !== null || snapshot.repetition !== null || snapshot.interval !== null || snapshot.efactor !== null ||
      snapshot.activeCorrection !== null || snapshot.checkpointReport !== null
    )) throw new ApiError(409, 'This topic has saved study material or progress. Start a new session for a different topic.');
    if (!rename && !dismiss) return NextResponse.json(snapshot);

    const session = await prisma.$transaction(async tx => {
      const result = await tx.session.updateMany({
        where: { ...owner, version: snapshot.version, ...(rename && { messages: { none: {} }, noteChunks: { none: {} } }) },
        data: { topic: rename ? updates.topic : undefined, activeCorrection: dismiss ? null : undefined, version: { increment: 1 } },
      });
      if (!result.count) throw new ApiError(409, 'The session changed. Reload it before trying again.');
      return tx.session.findFirstOrThrow({ where: owner, include: withMessages });
    });
    return NextResponse.json(session);
  } catch (error) { return apiError(error); }
}
