import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/api';

export const roomIdSchema = z.string().regex(/^[A-F0-9]{32}$/, 'Enter the full room code.');
export const roomSettingsSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  gameMode: z.enum(['classic', 'survival', 'rush']).default('classic'),
  studentLevel: z.enum(['kid', 'highschool', 'professional']).default('highschool'),
  studentBehavior: z.enum(['curious', 'skeptical', 'enthusiastic', 'distracted']).default('curious'),
}).strict();
const offerSchema = z.object({ type: z.literal('offer'), sdp: z.string().min(1).max(65_536) }).strict();
const answerSchema = z.object({ type: z.literal('answer'), sdp: z.string().min(1).max(65_536) }).strict();
const iceSchema = z.object({
  candidate: z.string().min(1).max(2_048),
  sdpMid: z.string().max(128).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(255).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
}).strict();
const stateSchema = z.object({
  hostOffer: offerSchema.optional(),
  guestAnswer: answerSchema.optional(),
  hostIceCandidates: z.array(iceSchema).max(100).default([]),
  guestIceCandidates: z.array(iceSchema).max(100).default([]),
});
export const signalingRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create-room'), data: roomSettingsSchema }).strict(),
  z.object({ action: z.literal('join-room'), room: roomIdSchema }).strict(),
  z.object({ action: z.literal('host-offer'), room: roomIdSchema, data: offerSchema }).strict(),
  z.object({ action: z.literal('guest-answer'), room: roomIdSchema, data: answerSchema }).strict(),
  z.object({ action: z.literal('host-ice'), room: roomIdSchema, data: iceSchema }).strict(),
  z.object({ action: z.literal('guest-ice'), room: roomIdSchema, data: iceSchema }).strict(),
]);
type Mutation = Exclude<z.infer<typeof signalingRequestSchema>, { action: 'create-room' | 'join-room' }>;

export async function requireRoomMember(roomId: string, userId: string) {
  const room = await prisma.room.findFirst({
    where: { id: roomId, expiresAt: { gt: new Date() }, OR: [{ hostId: userId }, { guestId: userId }] },
  });
  if (!room) throw new ApiError(404, 'Room not found, expired, or unavailable to this account.');
  return room;
}

export async function createRoom(userId: string, settings: z.infer<typeof roomSettingsSchema>) {
  const now = new Date();
  // Single persistent SQLite server: both the room cap and insert run in one transaction.
  return prisma.$transaction(async (tx) => {
    await tx.room.deleteMany({ where: { expiresAt: { lte: now } } });
    const ownCount = await tx.room.count({ where: { hostId: userId } });
    if (ownCount >= 3) throw new ApiError(429, 'You already have three active rooms. Rooms expire after two hours.');
    if (await tx.room.count() >= 2_000) throw new ApiError(503, 'Multiplayer is at capacity. Please try later.');
    return tx.room.create({ data: {
      id: randomBytes(16).toString('hex').toUpperCase(), hostId: userId, ...settings,
      state: JSON.stringify({ hostIceCandidates: [], guestIceCandidates: [] }),
      expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
    } });
  });
}

export async function joinRoom(roomId: string, userId: string) {
  const now = new Date();
  const existing = await prisma.room.findFirst({ where: { id: roomId, expiresAt: { gt: now } } });
  if (!existing) throw new ApiError(404, 'Room not found or expired. Ask your partner for a new room code.');
  if (existing.hostId === userId || existing.guestId === userId) return existing;
  // A single conditional write prevents two guests from claiming the same invitation.
  const claimed = await prisma.room.updateMany({
    where: { id: roomId, hostId: { not: userId }, guestId: null, expiresAt: { gt: now } },
    data: { guestId: userId, version: { increment: 1 } },
  });
  if (claimed.count !== 1) throw new ApiError(409, 'This room already has a partner.');
  return requireRoomMember(roomId, userId);
}

export async function readRoom(roomId: string, userId: string) {
  const room = await requireRoomMember(roomId, userId);
  const state = stateSchema.parse(JSON.parse(room.state));
  return { ...state, room: room.id, topic: room.topic, gameMode: room.gameMode,
    studentLevel: room.studentLevel, studentBehavior: room.studentBehavior,
    role: room.hostId === userId ? 'host' : 'guest', expiresAt: room.expiresAt };
}

export async function updateRoom(userId: string, input: Mutation) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await requireRoomMember(input.room, userId);
    const isHostAction = input.action.startsWith('host-');
    if ((isHostAction && room.hostId !== userId) || (!isHostAction && room.guestId !== userId)) {
      throw new ApiError(403, 'Only the designated participant can make this room change.');
    }
    const state = stateSchema.parse(JSON.parse(room.state));
    if (input.action === 'host-offer') {
      if (state.hostOffer && JSON.stringify(state.hostOffer) !== JSON.stringify(input.data)) {
        throw new ApiError(409, 'This room already has an offer. Create a new room to reconnect.');
      }
      state.hostOffer = input.data;
    } else if (input.action === 'guest-answer') {
      if (!state.hostOffer) throw new ApiError(409, 'Wait for the host to connect before answering.');
      if (state.guestAnswer && JSON.stringify(state.guestAnswer) !== JSON.stringify(input.data)) {
        throw new ApiError(409, 'This room already has an answer. Create a new room to reconnect.');
      }
      state.guestAnswer = input.data;
    } else {
      const candidates = input.action === 'host-ice' ? state.hostIceCandidates : state.guestIceCandidates;
      if (candidates.some(candidate => JSON.stringify(candidate) === JSON.stringify(input.data))) return;
      if (candidates.length >= 100) throw new ApiError(413, 'The connection candidate limit was reached. Create a new room.');
      candidates.push(input.data);
    }
    const result = await prisma.room.updateMany({
      where: { id: room.id, version: room.version, expiresAt: { gt: new Date() } },
      data: { state: JSON.stringify(state), version: { increment: 1 } },
    });
    if (result.count === 1) return;
  }
  throw new ApiError(409, 'The room changed during this request. Please try again.');
}
