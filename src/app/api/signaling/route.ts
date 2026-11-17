import { NextResponse } from 'next/server';
import { apiError, readJson, requireUser, consumeRateLimit } from '@/lib/api';
import { createRoom, joinRoom, readRoom, roomIdSchema, signalingRequestSchema, updateRoom } from '@/lib/signaling';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req, 'signaling-read', 90);
    const roomId = roomIdSchema.parse(new URL(req.url).searchParams.get('room'));
    return NextResponse.json(await readRoom(roomId, user.id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, 'signaling-write', 150);
    const input = signalingRequestSchema.parse(await readJson(req, 75_000));
    if (input.action === 'create-room') {
      await consumeRateLimit(`room-create:${user.id}`, 5, 30 * 60_000);
      const room = await createRoom(user.id, input.data);
      return NextResponse.json({ success: true, room: room.id }, { status: 201 });
    }
    if (input.action === 'join-room') {
      await consumeRateLimit(`room-join:${user.id}`, 10, 60_000);
      const room = await joinRoom(input.room, user.id);
      return NextResponse.json({ success: true, room: room.id });
    }
    await updateRoom(user.id, input);
    return NextResponse.json({ success: true });
  } catch (error) { return apiError(error); }
}
