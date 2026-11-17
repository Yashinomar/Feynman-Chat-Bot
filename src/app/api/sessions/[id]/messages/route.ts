import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, readJson, requireUser } from '@/lib/api';

// A client can append its own ungraded message; AI evaluations are only written by /api/chat.
const input = z.object({ role: z.literal('user'), content: z.string().trim().min(1).max(6000) }).strict();
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, 'messages', 20);
    const { id } = await params;
    const data = input.parse(await readJson(req, 40_000));
    const message = await prisma.$transaction(async tx => {
      const session = await tx.session.findFirst({ where: { id, userId: user.id } });
      if (!session) throw new ApiError(404, 'Session not found.');
      const last = await tx.message.findFirst({ where: { sessionId: id }, orderBy: { sequence: 'desc' } });
      if ((last?.sequence ?? -1) >= 499) throw new ApiError(409, 'This session is full. Start a new session.');
      const saved = await tx.message.create({ data: { ...data, sessionId: id, sequence: (last?.sequence ?? -1) + 1 } });
      await tx.session.update({ where: { id, userId: user.id }, data: { version: { increment: 1 } } });
      return saved;
    });
    return NextResponse.json(message, { status: 201 });
  } catch (error) { return apiError(error); }
}
