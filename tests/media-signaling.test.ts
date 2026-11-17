import { beforeEach, describe, expect, it, vi } from 'vitest';
const identity = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('@/auth', () => ({ auth: vi.fn(async () => identity.userId ? { user: { id: identity.userId } } : null) }));
import { prisma } from '@/lib/prisma';
import { GET, POST } from '@/app/api/signaling/route';
import { resetDatabase } from './db';

const host = 'test-host';
const guest = 'test-guest';
const outsider = 'test-outsider';
function request(body: unknown) { return new Request('http://localhost/api/signaling', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
async function create() {
  identity.userId = host;
  const response = await POST(request({ action: 'create-room', data: { topic: 'Cell division', gameMode: 'classic' } }));
  expect(response.status).toBe(201);
  return (await response.json()).room as string;
}
async function join(room: string, userId = guest) {
  identity.userId = userId;
  return POST(request({ action: 'join-room', room }));
}

beforeEach(async () => {
  await resetDatabase();
  for (const id of [host, guest, outsider]) await prisma.user.create({ data: { id, username: id, password: 'test-only-hash' } });
  identity.userId = host;
});

describe('durable, participant-bound signaling', () => {
  it('requires authentication for reads and writes', async () => {
    identity.userId = null;
    expect((await GET(new Request(`http://localhost/api/signaling?room=${'A'.repeat(32)}`))).status).toBe(401);
    expect((await POST(request({ action: 'create-room', data: { topic: 'Biology' } }))).status).toBe(401);
    expect(await prisma.room.count()).toBe(0);
  });
  it('generates strong IDs and preserves room settings in the database', async () => {
    const room = await create();
    expect(room).toMatch(/^[A-F0-9]{32}$/);
    const record = await prisma.room.findUniqueOrThrow({ where: { id: room } });
    expect(record.hostId).toBe(host);
    expect(record.expiresAt.getTime() - record.createdAt.getTime()).toBeGreaterThan(7_199_000);
    expect((await POST(request({ action: 'create-room', room, data: { topic: 'Hijack' } }))).status).toBe(400);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: room } })).topic).toBe('Cell division');
  });
  it('denies an outsider reads, answers, and ICE then claims only one guest', async () => {
    const room = await create();
    identity.userId = outsider;
    expect((await GET(new Request(`http://localhost/api/signaling?room=${room}`))).status).toBe(404);
    expect((await POST(request({ room, action: 'host-ice', data: { candidate: 'candidate:1' } }))).status).toBe(404);
    expect((await join(room)).status).toBe(200);
    expect((await join(room, outsider)).status).toBe(409);
    const record = await prisma.room.findUniqueOrThrow({ where: { id: room } });
    expect(record.guestId).toBe(guest);
  });
  it('permits only host offers and guest answers; deduplicates candidates and survives reconnect reads', async () => {
    const room = await create();
    await join(room);
    const offer = { type: 'offer', sdp: 'v=0\r\n' };
    expect((await POST(request({ room, action: 'host-offer', data: offer }))).status).toBe(403);
    expect((await POST(request({ room, action: 'guest-answer', data: { type: 'answer', sdp: 'v=0' } }))).status).toBe(409);
    identity.userId = host;
    expect((await POST(request({ room, action: 'host-offer', data: offer }))).status).toBe(200);
    expect((await POST(request({ room, action: 'guest-answer', data: { type: 'answer', sdp: 'v=0' } }))).status).toBe(403);
    const ice = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 };
    for (let i = 0; i < 2; i++) expect((await POST(request({ room, action: 'host-ice', data: ice }))).status).toBe(200);
    identity.userId = guest;
    expect((await POST(request({ room, action: 'guest-answer', data: { type: 'answer', sdp: 'v=0' } }))).status).toBe(200);
    const read = await GET(new Request(`http://localhost/api/signaling?room=${room}`));
    const state = await read.json();
    expect(state.hostOffer).toEqual(offer);
    expect(state.hostIceCandidates).toEqual([ice]);
    expect(state.role).toBe('guest');
  });
  it('rejects expired rooms and bounds candidates, SDP and live rooms', async () => {
    const room = await create();
    const candidates = Array.from({ length: 100 }, (_, index) => ({ candidate: `candidate:${index}` }));
    await prisma.room.update({ where: { id: room }, data: { state: JSON.stringify({ hostIceCandidates: candidates, guestIceCandidates: [] }) } });
    expect((await POST(request({ room, action: 'host-ice', data: { candidate: 'candidate:extra' } }))).status).toBe(413);
    expect((await POST(request({ room, action: 'host-offer', data: { type: 'offer', sdp: 'x'.repeat(65_537) } }))).status).toBe(400);
    await create(); await create();
    expect((await POST(request({ action: 'create-room', data: { topic: 'Fourth room' } }))).status).toBe(429);
    await prisma.room.update({ where: { id: room }, data: { expiresAt: new Date(0) } });
    expect((await GET(new Request(`http://localhost/api/signaling?room=${room}`))).status).toBe(404);
    expect((await join(room)).status).toBe(404);
  });
});
