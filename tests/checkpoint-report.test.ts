import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ userId: null as string | null, generate: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn(async () => state.userId ? { user: { id: state.userId } } : null) }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: state.generate }; } }));

import { prisma } from '@/lib/prisma';
import { POST as checkpoint } from '@/app/api/sessions/[id]/checkpoint/route';
import { studySessionSchema } from '@/lib/client-api';
import { parseCheckpointReport } from '@/lib/checkpoint-report';

const path = [
  { title: 'The basic idea', objective: 'Explain the main idea clearly.' },
  { title: 'Key parts', objective: 'Explain the important parts clearly.' },
  { title: 'How it works', objective: 'Explain how the parts work together.' },
  { title: 'An example', objective: 'Apply the idea in a concrete example.' },
  { title: 'Deeper reasoning', objective: 'Explain a limitation of the model.' },
];

const analysis = {
  summary: 'Two ideas are strong, two are developing, and one needs focused practice.',
  conceptMap: {
    nodes: [
      { id: 'inputs', label: 'Inputs make sugar', status: 'connected' },
      { id: 'growth', label: 'Sugar supports growth', status: 'connected' },
      { id: 'limit', label: 'Less input means less sugar', status: 'review' },
    ],
    links: [
      { from: 'inputs', to: 'growth', label: 'Sugar supports growth', status: 'connected' },
      { from: 'growth', to: 'limit', label: 'The limiting link is missing', status: 'review' },
    ],
  },
  criteria: [
    { name: 'Accuracy', status: 'Demonstrated', evidence: 'The explanation correctly names the core inputs.', nextStep: 'Keep the description precise in the next explanation.' },
    { name: 'Coverage', status: 'Partly demonstrated', evidence: 'The main process is covered but one output is missing.', nextStep: 'Add the missing output to the explanation.' },
    { name: 'Cause-and-effect reasoning', status: 'Partly demonstrated', evidence: 'Growth is linked to sugar but the limiting input is not.', nextStep: 'Explain how less input changes sugar production.' },
    { name: 'Clarity', status: 'Demonstrated', evidence: 'The answer uses short sentences and familiar language.', nextStep: 'Keep the same clear structure.' },
    { name: 'Application', status: 'Needs practice', evidence: 'The prediction does not apply the changed condition.', nextStep: 'Use the limiting factor in the prediction.' },
  ],
  firstReview: { stepIndex: 2, title: 'Review how the parts work together', explanation: 'Reconnect the limiting input to sugar production and growth.' },
} as const;

const endpoint = (id: string, body: unknown) => new Request(`http://localhost:3000/api/sessions/${id}/checkpoint`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const context = (id: string) => ({ params: Promise.resolve({ id }) });

async function checkpointSession() {
  const user = await prisma.user.create({ data: { username: `owner-${crypto.randomUUID()}`, password: 'test-only' } });
  state.userId = user.id;
  return prisma.session.create({
    data: {
      userId: user.id,
      topic: 'Photosynthesis',
      studentLevel: 'highschool',
      status: 'checkpoint',
      masteryScore: 100,
      pathIndex: path.length - 1,
      learningPath: JSON.stringify(path),
      version: 4,
      messages: { create: { role: 'ai', content: 'Your checkpoint is ready.', sequence: 0 } },
    },
    include: { messages: true },
  });
}

beforeEach(async () => {
  state.userId = null;
  process.env.GEMINI_API_KEY = 'controlled-test-key';
  state.generate.mockReset().mockResolvedValue({ text: JSON.stringify(analysis) });
  await prisma.rateLimit.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

describe('persisted Feynman checkpoint report', () => {
  it('keeps legacy completed sessions without a report loadable and rejects extra submission fields', async () => {
    const session = await checkpointSession();
    const serialized = JSON.parse(JSON.stringify({ ...session, status: 'completed', checkpointReport: null }));
    expect(studySessionSchema.parse(serialized)).toMatchObject({ status: 'completed', checkpointReport: null });
    expect((await checkpoint(endpoint(session.id, {
      content: 'My explanation.', requestId: crypto.randomUUID(), expectedVersion: 4, status: 'completed',
    }), context(session.id))).status).toBe(400);
  });

  it('requires authentication and hides another learner’s checkpoint', async () => {
    const session = await checkpointSession();
    const body = { content: 'My explanation.', requestId: crypto.randomUUID(), expectedVersion: 4 };
    state.userId = null;
    expect((await checkpoint(endpoint(session.id, body), context(session.id))).status).toBe(401);
    const other = await prisma.user.create({ data: { username: 'other-checkpoint', password: 'test-only' } });
    state.userId = other.id;
    expect((await checkpoint(endpoint(session.id, body), context(session.id))).status).toBe(404);
  });

  it('atomically saves all criteria, messages, completion, and supports an idempotent replay', async () => {
    const session = await checkpointSession();
    const requestId = crypto.randomUUID();
    const body = { content: 'Plants connect inputs to stored energy and growth.', requestId, expectedVersion: 4 };
    const response = await checkpoint(endpoint(session.id, body), context(session.id));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.session).toMatchObject({ status: 'completed', version: 5, masteryScore: 100 });
    expect(result.report.criteria).toHaveLength(5);
    expect(result.report.criteria.map((criterion: { name: string }) => criterion.name)).toEqual(analysis.criteria.map(criterion => criterion.name));
    const saved = await prisma.session.findUniqueOrThrow({ where: { id: session.id }, include: { messages: { orderBy: { sequence: 'asc' } } } });
    expect(parseCheckpointReport(saved.checkpointReport)).toMatchObject({ schemaVersion: 1, requestId, firstReview: analysis.firstReview });
    expect(saved.messages.slice(-2).map(message => [message.role, message.requestId])).toEqual([['user', requestId], ['ai', requestId]]);
    expect(state.generate).toHaveBeenCalledTimes(1);

    const replay = await checkpoint(endpoint(session.id, { ...body, expectedVersion: 4 }), context(session.id));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, session: { version: 5 } });
    expect(state.generate).toHaveBeenCalledTimes(1);
  });

  it('allows exactly one concurrent submission to commit and keeps the winner replayable', async () => {
    const session = await checkpointSession();
    let releaseBoth!: () => void;
    const bothGenerating = new Promise<void>(resolve => { releaseBoth = resolve; });
    state.generate.mockImplementation(async () => {
      if (state.generate.mock.calls.length === 2) releaseBoth();
      await bothGenerating;
      return { text: JSON.stringify(analysis) };
    });
    const attempts = [
      { content: 'First simultaneous checkpoint answer.', requestId: crypto.randomUUID(), expectedVersion: 4 },
      { content: 'Second simultaneous checkpoint answer.', requestId: crypto.randomUUID(), expectedVersion: 4 },
    ];
    const responses = await Promise.all(attempts.map(body => checkpoint(endpoint(session.id, body), context(session.id))));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);

    const winningIndex = responses.findIndex(response => response.status === 200);
    const winningBody = attempts[winningIndex];
    const winningResult = await responses[winningIndex].json();
    expect(winningResult.report.requestId).toBe(winningBody.requestId);
    const saved = await prisma.session.findUniqueOrThrow({
      where: { id: session.id }, include: { messages: { orderBy: { sequence: 'asc' } } },
    });
    expect(saved).toMatchObject({ status: 'completed', version: 5 });
    expect(saved.messages).toHaveLength(3);
    expect(saved.messages.slice(-2).map(message => [message.role, message.requestId])).toEqual([
      ['user', winningBody.requestId], ['ai', winningBody.requestId],
    ]);
    expect(await prisma.message.count({ where: { sessionId: session.id, requestId: attempts[1 - winningIndex].requestId } })).toBe(0);

    const replay = await checkpoint(endpoint(session.id, winningBody), context(session.id));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, report: { requestId: winningBody.requestId } });
    expect(state.generate).toHaveBeenCalledTimes(2);
  });

  it('rejects checkpoint state without a persisted learning path before generating a report', async () => {
    const session = await checkpointSession();
    await prisma.session.update({ where: { id: session.id }, data: { learningPath: null } });
    const response = await checkpoint(endpoint(session.id, {
      content: 'An answer without a stored path.', requestId: crypto.randomUUID(), expectedVersion: 4,
    }), context(session.id));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('learning path is unavailable') });
    expect(state.generate).not.toHaveBeenCalled();
    expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({
      status: 'checkpoint', version: 4, checkpointReport: null, learningPath: null,
    });
    expect(await prisma.message.count({ where: { sessionId: session.id } })).toBe(1);
  });

  it('rejects stale, wrong-state, unfinished, and reused requests without changing saved work', async () => {
    const session = await checkpointSession();
    expect((await checkpoint(endpoint(session.id, { content: 'Answer', requestId: crypto.randomUUID(), expectedVersion: 3 }), context(session.id))).status).toBe(409);
    await prisma.session.update({ where: { id: session.id }, data: { status: 'active' } });
    expect((await checkpoint(endpoint(session.id, { content: 'Answer', requestId: crypto.randomUUID(), expectedVersion: 4 }), context(session.id))).status).toBe(409);
    await prisma.session.update({ where: { id: session.id }, data: { status: 'checkpoint', masteryScore: 90 } });
    expect((await checkpoint(endpoint(session.id, { content: 'Answer', requestId: crypto.randomUUID(), expectedVersion: 4 }), context(session.id))).status).toBe(409);

    await prisma.session.update({ where: { id: session.id }, data: { masteryScore: 100 } });
    const requestId = crypto.randomUUID();
    const first = { content: 'Original answer', requestId, expectedVersion: 4 };
    expect((await checkpoint(endpoint(session.id, first), context(session.id))).status).toBe(200);
    expect((await checkpoint(endpoint(session.id, { ...first, content: 'Changed answer' }), context(session.id))).status).toBe(409);
  });

  it('saves nothing when the model output or review index is invalid', async () => {
    const session = await checkpointSession();
    state.generate.mockResolvedValueOnce({ text: JSON.stringify({ ...analysis, criteria: analysis.criteria.slice(0, 4) }) });
    const body = { content: 'A checkpoint answer.', requestId: crypto.randomUUID(), expectedVersion: 4 };
    expect((await checkpoint(endpoint(session.id, body), context(session.id))).status).toBe(502);
    expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ status: 'checkpoint', version: 4, checkpointReport: null });
    expect(await prisma.message.count({ where: { sessionId: session.id } })).toBe(1);

    state.generate.mockResolvedValueOnce({ text: JSON.stringify({ ...analysis, firstReview: { ...analysis.firstReview, stepIndex: 99 } }) });
    expect((await checkpoint(endpoint(session.id, { ...body, requestId: crypto.randomUUID() }), context(session.id))).status).toBe(502);
    expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ status: 'checkpoint', version: 4, checkpointReport: null });

    state.generate.mockResolvedValueOnce({ text: JSON.stringify({
      ...analysis,
      conceptMap: { ...analysis.conceptMap, links: [
        { from: 'inputs', to: 'inputs', label: 'A misleading self-link', status: 'connected' },
        analysis.conceptMap.links[1],
      ] },
    }) });
    expect((await checkpoint(endpoint(session.id, { ...body, requestId: crypto.randomUUID() }), context(session.id))).status).toBe(502);
    expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ status: 'checkpoint', version: 4, checkpointReport: null });
  });
});
