import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  generateContent: vi.fn(),
  embedContent: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: vi.fn(async () => mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class {
  models = { generateContent: mocks.generateContent, embedContent: mocks.embedContent };
} }));

import { prisma } from '@/lib/prisma';
import { POST as upload } from '@/app/api/rag/route';
import { POST as chat } from '@/app/api/chat/route';
import { POST as hint } from '@/app/api/hint/route';
import { POST as quiz } from '@/app/api/quiz/route';
import { POST as factcheck } from '@/app/api/factcheck/route';
import { PUT as updateSession } from '@/app/api/sessions/[id]/route';

function request(body: unknown) {
  return new Request('http://localhost:3000/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
async function fixture() {
  const user = await prisma.user.create({ data: { username: 'owner', password: 'not-a-real-credential' } });
  mocks.userId = user.id;
  return prisma.session.create({ data: {
    topic: 'Cell biology', userId: user.id,
    messages: { create: { role: 'ai', content: 'Explain ATP production.', sequence: 0 } },
  }, include: { messages: true } });
}

async function commitTurn(sessionId: string, content: string, version = 0) {
  const input = { sessionId, content, requestId: crypto.randomUUID(), expectedVersion: version };
  expect((await chat(request(input))).status).toBe(200);
  return input;
}

function factCheckRequest(turn: Awaited<ReturnType<typeof commitTurn>>) {
  return request({ sessionId: turn.sessionId, requestId: turn.requestId, expectedVersion: turn.expectedVersion + 1 });
}

function wikipediaSource() {
  return Response.json({ query: { pages: { '123': { extract: 'Mitochondria produce ATP.' } } } });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.generateContent.mockReset().mockImplementation(async ({ config }: { config: { systemInstruction: string } }) => ({ text: config.systemInstruction.startsWith('Design an ordered Feynman')
    ? JSON.stringify({ subtopics: [
      { title: 'Key parts', objective: 'Explain the key parts of cell biology.' },
      { title: 'Cell mechanisms', objective: 'Explain how cells make and use energy.' },
      { title: 'Real examples', objective: 'Explain a real cell biology example.' },
      { title: 'Deeper reasoning', objective: 'Explain a limitation of the simple model.' },
    ] }) : '{"reply":"What process produces ATP?","score":80,"stepComplete":false}' }));
  mocks.embedContent.mockReset().mockImplementation(async ({ contents }: { contents: string[] }) => ({
    embeddings: contents.map(text => ({ values: text.includes('mitochondria') ? [1, 0] : [0, 1] })),
  }));
  process.env.GEMINI_API_KEY = 'controlled-test-key';
  await prisma.rateLimit.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  mocks.userId = null;
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('study APIs with real SQLite persistence and controlled AI', () => {
  it('requires authentication for every AI and upload API', async () => {
    for (const route of [upload, chat, hint, quiz, factcheck]) expect((await route(request({}))).status).toBe(401);
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(mocks.embedContent).not.toHaveBeenCalled();
  });

  it('enforces two-user access on chat, hints and fact checks before provider calls', async () => {
    const session = await fixture();
    const other = await prisma.user.create({ data: { username: 'other', password: 'test-only' } });
    mocks.userId = other.id;
    expect((await chat(request({ sessionId: session.id, content: 'hello', requestId: crypto.randomUUID(), expectedVersion: 0 }))).status).toBe(404);
    expect((await hint(request({ sessionId: session.id }))).status).toBe(404);
    expect((await factcheck(request({ sessionId: session.id, requestId: crypto.randomUUID(), expectedVersion: 1 }))).status).toBe(404);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('links uploaded notes to the real owned session, retrieves the relevant passage after reconnect, and saves a complete turn', async () => {
    const oldSession = await fixture();
    const text = `Unrelated volcano notes ${'ash '.repeat(350)}\nThe mitochondria generate ATP during cellular respiration. ${'Energy '.repeat(150)}`;
    const uploadedResponse = await upload(request({ topic: 'Cell biology', documentText: text }));
    expect(uploadedResponse.status).toBe(201);
    const uploaded = await uploadedResponse.json();
    expect(uploaded.sessionId).toBe(uploaded.session.id);
    expect(uploaded.session.userId).toBe(oldSession.userId);
    expect(await prisma.noteChunk.count({ where: { sessionId: uploaded.sessionId } })).toBeGreaterThan(1);
    await prisma.$disconnect(); // Read from durable storage, not process-global notes.
    const requestId = crypto.randomUUID();
    const response = await chat(request({ sessionId: uploaded.sessionId, content: 'The mitochondria generate ATP.', requestId, expectedVersion: 0 }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.sources[0].text).toContain('mitochondria');
    expect(mocks.generateContent.mock.calls[1][0].config.systemInstruction).toContain(JSON.stringify(result.sources[0].text));
    const reloaded = await prisma.session.findUniqueOrThrow({ where: { id: uploaded.sessionId }, include: { messages: { orderBy: { sequence: 'asc' } } } });
    expect(reloaded.pathIndex).toBe(0);
    expect(reloaded.masteryScore).toBe(16);
    expect(reloaded.repetition).toBe(0);
    expect(reloaded.interval).toBe(1);
    expect(reloaded.reviewDate?.toISOString()).toBe(result.session.reviewDate);
    expect(reloaded.messages.map(message => message.role)).toEqual(['ai', 'user', 'ai']);
    expect(reloaded.version).toBe(1);
    const replay = await chat(request({ sessionId: uploaded.sessionId, content: 'The mitochondria generate ATP.', requestId, expectedVersion: 0 }));
    expect(replay.status).toBe(200);
    expect((await replay.json()).replayed).toBe(true);
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    expect(await prisma.message.count({ where: { sessionId: reloaded.id } })).toBe(3);
  });

  it('rejects invalid requests and invalid AI mastery without writing messages or scores', async () => {
    const session = await fixture();
    const valid = { sessionId: session.id, content: 'ATP is an energy carrier.', requestId: crypto.randomUUID(), expectedVersion: 0 };
    expect((await chat(request({ ...valid, userId: 'intruder' }))).status).toBe(400);
    expect((await chat(request({ ...valid, content: 'x'.repeat(6001) }))).status).toBe(400);
    mocks.generateContent.mockResolvedValueOnce({ text: '{"reply":"You are done","score":500}' });
    expect((await chat(request(valid))).status).toBe(502);
    mocks.generateContent.mockRejectedValueOnce(new Error('sensitive provider message'));
    const failed = await chat(request(valid));
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain('sensitive');
    const saved = await prisma.session.findUniqueOrThrow({ where: { id: session.id }, include: { messages: true } });
    expect(saved.masteryScore).toBe(0);
    expect(saved.reviewDate).toBeNull();
    expect(saved.messages).toHaveLength(1);
  });

  it('rolls back score, dates, and both messages when a database write fails', async () => {
    const session = await fixture();
    await prisma.$executeRawUnsafe('CREATE TRIGGER test_fail_message BEFORE INSERT ON Message BEGIN SELECT RAISE(ABORT, \'controlled write failure\'); END;');
    try {
      const response = await chat(request({ sessionId: session.id, content: 'ATP carries energy.', requestId: crypto.randomUUID(), expectedVersion: 0 }));
      expect(response.status).toBe(500);
      const saved = await prisma.session.findUniqueOrThrow({ where: { id: session.id }, include: { messages: true } });
      expect(saved.masteryScore).toBe(0);
      expect(saved.reviewDate).toBeNull();
      expect(saved.version).toBe(0);
      expect(saved.messages).toHaveLength(1);
    } finally { await prisma.$executeRawUnsafe('DROP TRIGGER test_fail_message;'); }
  });

  it('rejects stale concurrent turns before generation and rejects request ID reuse for changed content', async () => {
    const session = await fixture();
    const input = { sessionId: session.id, content: 'ATP carries energy.', requestId: crypto.randomUUID(), expectedVersion: 0 };
    expect((await chat(request(input))).status).toBe(200);
    expect((await chat(request({ ...input, requestId: crypto.randomUUID() }))).status).toBe(409);
    expect((await chat(request({ ...input, content: 'Different content' }))).status).toBe(409);
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it('refuses empty and partially indexed uploads and never creates an unusable session', async () => {
    await fixture();
    expect((await upload(request({ topic: 'Biology', documentText: '   ' }))).status).toBe(400);
    mocks.embedContent.mockResolvedValueOnce({ embeddings: [] });
    expect((await upload(request({ topic: 'Biology', documentText: 'Readable notes with enough useful text for indexing.' }))).status).toBe(502);
    expect(await prisma.session.count()).toBe(1);
    expect(await prisma.noteChunk.count()).toBe(0);
  });

  it('does not silently substitute fake learning results when the model key is missing', async () => {
    const session = await fixture();
    delete process.env.GEMINI_API_KEY;
    expect((await chat(request({ sessionId: session.id, content: 'hello', requestId: crypto.randomUUID(), expectedVersion: 0 }))).status).toBe(503);
    expect((await quiz(request({ topic: 'Biology' }))).status).toBe(503);
  });

  it('labels missing sources, failed fetches and malformed fact-check output as unverified', async () => {
    const session = await fixture();
    const turn = await commitTurn(session.id, 'Mitochondria produce ATP.');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ query: { pages: { '-1': { missing: '' } } } }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await (await factcheck(factCheckRequest(turn))).json()).status).toBe('unverified');
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect((await (await factcheck(factCheckRequest(turn))).json()).status).toBe('unverified');
    fetchMock.mockResolvedValueOnce(wikipediaSource());
    mocks.generateContent.mockResolvedValueOnce({ text: 'not JSON' });
    expect((await (await factcheck(factCheckRequest(turn))).json()).status).toBe('unverified');
  });

  it('checks only the canonical latest graded answer in the owned session', async () => {
    const session = await fixture();
    const otherSession = await prisma.session.create({ data: { topic: 'Other topic', userId: session.userId } });
    const otherTurn = await commitTurn(otherSession.id, 'An answer from a different session.');
    const turn = await commitTurn(session.id, 'The nucleus makes ATP.');
    mocks.generateContent.mockClear();
    const fetchMock = vi.fn(async () => wikipediaSource());
    vi.stubGlobal('fetch', fetchMock);

    expect((await factcheck(factCheckRequest({ ...turn, requestId: otherTurn.requestId }))).status).toBe(409);
    expect((await factcheck(factCheckRequest({ ...turn, requestId: crypto.randomUUID() }))).status).toBe(409);
    expect((await factcheck(request({ sessionId: session.id, requestId: turn.requestId, expectedVersion: 1, latestMessage: 'Forged answer.' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();

    mocks.generateContent.mockResolvedValueOnce({ text: '{"status":"inaccurate","correction":"Mitochondria produce ATP."}' });
    const response = await factcheck(factCheckRequest(turn));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'inaccurate', correction: 'Mitochondria produce ATP.' });
    expect(JSON.parse(mocks.generateContent.mock.calls[0][0].contents[0].parts[0].text).claim).toBe(turn.content);
    expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ activeCorrection: 'Mitochondria produce ATP.', version: 1 });
  });

  it('rejects a stale arrival after chat replay even with the newer snapshot version', async () => {
    const session = await fixture();
    const earlier = await commitTurn(session.id, 'First answer.');
    await commitTurn(session.id, 'Second answer.', 1);
    const replay = await chat(request(earlier));
    expect(await replay.json()).toMatchObject({ replayed: true, session: { version: 2 } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await factcheck(factCheckRequest(earlier))).status).toBe(409);
    expect((await factcheck(factCheckRequest({ ...earlier, expectedVersion: 1 }))).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['new turn', 'dismissal'])('discards a fact check that finishes after a %s', async change => {
    const session = await fixture();
    const turn = await commitTurn(session.id, 'The nucleus makes ATP.');
    vi.stubGlobal('fetch', vi.fn(async () => wikipediaSource()));
    mocks.generateContent.mockResolvedValueOnce({ text: '{"status":"inaccurate","correction":"Mitochondria produce ATP."}' });
    expect((await factcheck(factCheckRequest(turn))).status).toBe(200);

    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    let finish!: (result: { text: string }) => void;
    const delayedResult = new Promise<{ text: string }>(resolve => { finish = resolve; });
    mocks.generateContent.mockImplementationOnce(() => {
      markStarted();
      return delayedResult;
    });
    const delayed = factcheck(factCheckRequest(turn));
    await started;
    if (change === 'new turn') {
      await commitTurn(session.id, 'Mitochondria produce ATP.', 1);
    } else {
      const dismiss = new Request(`http://localhost:3000/api/sessions/${session.id}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ activeCorrection: null, expectedVersion: 1 }),
      });
      expect((await updateSession(dismiss, { params: Promise.resolve({ id: session.id }) })).status).toBe(200);
    }
    finish({ text: '{"status":"inaccurate","correction":"An old correction must not come back."}' });
    expect((await delayed).status).toBe(409);
    expect((await factcheck(factCheckRequest(turn))).status).toBe(409);
    expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ activeCorrection: null, version: 2 });
  });

  it('validates quiz answer membership instead of accepting malformed model questions', async () => {
    await fixture();
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ questions: Array.from({ length: 10 }, () => ({ question: 'Which?', options: ['a', 'b', 'c', 'd'], answer: 'missing' })) }) });
    expect((await quiz(request({ topic: 'Biology' }))).status).toBe(502);
  });
});
