import { beforeEach, describe, expect, it, vi } from 'vitest';
const identity = vi.hoisted(() => ({ userId: null as string | null }));
const mockTranscribe = vi.hoisted(() => vi.fn(async (samples: Float32Array) => { void samples; return 'A clear explanation.'; }));
vi.mock('@/auth', () => ({ auth: vi.fn(async () => identity.userId ? { user: { id: identity.userId } } : null) }));
vi.mock('@/lib/transcription', () => ({ transcribe: mockTranscribe }));
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/transcribe/route';
import { ApiError } from '@/lib/api';
import { resetDatabase } from './db';
const audio = Array(4_000).fill(0.25) as number[];
function request(body: unknown) { return new Request('http://localhost/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

beforeEach(async () => {
  await resetDatabase();
  await prisma.user.create({ data: { id: 'speaker', username: 'speaker', password: 'test-only-hash' } });
  identity.userId = 'speaker';
  mockTranscribe.mockReset().mockResolvedValue('A clear explanation.');
});
describe('bounded transcription requests', () => {
  it('requires authentication before reading or processing audio', async () => {
    identity.userId = null;
    expect((await POST(request({ sampleRate: 16_000, audio }))).status).toBe(401);
    expect(mockTranscribe).not.toHaveBeenCalled();
  });
  it.each([
    { sampleRate: 48_000, audio }, { sampleRate: 16_000, audio: [0.25] },
    { sampleRate: 16_000, audio: [...audio, 2] }, { sampleRate: 16_000, audio: [...audio, null] },
    { sampleRate: 16_000, audio: [...audio, '0.2'] }, { sampleRate: 16_000, audio: Array(960_001).fill(0) },
  ])('rejects invalid audio without loading a model', async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mockTranscribe).not.toHaveBeenCalled();
  });
  it('rejects oversized declared payloads before model work', async () => {
    const req = new Request('http://localhost/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(24 * 1024 * 1024 + 1) }, body: '{}' });
    expect((await POST(req)).status).toBe(413);
    expect(mockTranscribe).not.toHaveBeenCalled();
  });
  it('returns typed audio results and caps user requests', async () => {
    const response = await POST(request({ sampleRate: 16_000, audio }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: 'A clear explanation.' });
    expect(mockTranscribe.mock.calls[0][0]).toBeInstanceOf(Float32Array);
    expect((await POST(request({ sampleRate: 16_000, audio }))).status).toBe(200);
    expect((await POST(request({ sampleRate: 16_000, audio }))).status).toBe(429);
  });
  it('reports a model failure without a fake transcript', async () => {
    mockTranscribe.mockRejectedValue(new ApiError(503, 'Speech recognition could not load. Please type your explanation.'));
    const response = await POST(request({ sampleRate: 16_000, audio }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('could not load') });
  });
});
