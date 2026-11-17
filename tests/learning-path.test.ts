import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ userId: null as string | null, generate: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn(async () => state.userId ? { user: { id: state.userId } } : null) }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: state.generate }; } }));
import { prisma } from '@/lib/prisma';
import { POST as create } from '@/app/api/sessions/route';
import { POST as chat } from '@/app/api/chat/route';
import { advancePath, parseLearningPath } from '@/lib/learning-path';

const endpoint = (path: string, body: unknown) => new Request('http://localhost:3000/api/' + path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const generated = (n: number) => ({ subtopics: [
  { title: 'Key parts', objective: 'Explain the main parts of the topic.' },
  { title: 'How it works', objective: 'Explain how those parts interact.' },
  { title: 'An example', objective: 'Explain a concrete example in context.' },
  { title: 'Deeper reasoning', objective: 'Explain the limits of the simple model.' },
  { title: 'Putting it together', objective: 'Connect the ideas in a complex application.' },
].slice(0, n) });

beforeEach(async () => {
  state.userId = null;
  process.env.GEMINI_API_KEY = 'controlled-test-key';
  state.generate.mockReset().mockImplementation(async ({ config }: { config: { systemInstruction: string } }) => {
    const prompt = config.systemInstruction;
    if (prompt.startsWith('Design an ordered')) {
      const count = Number(prompt.match(/exactly (\d+) specific/)?.[1] ?? 4);
      return { text: JSON.stringify(generated(count)) };
    }
    return { text: JSON.stringify({ reply: 'That is clear.', score: 90, stepComplete: true }) };
  });
  await prisma.rateLimit.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  const user = await prisma.user.create({ data: { username: 'path-owner', password: 'test-only' } });
  state.userId = user.id;
});

describe('ordered learning pathway', () => {
  it('creates a topic-specific path with basic concepts first and level-dependent depth', async () => {
    for (const [level, length] of [['kid', 4], ['highschool', 5], ['professional', 6]] as const) {
      const response = await create(endpoint('sessions', { topic: 'Photosynthesis', studentLevel: level }));
      expect(response.status).toBe(201);
      const session = await response.json();
      const path = parseLearningPath(session.learningPath)!;
      expect(path).toHaveLength(length);
      expect(path[0].title).toBe('The basic idea');
      expect(path[0].objective).toContain('Photosynthesis');
      expect(path.at(-1)!.title).not.toBe(path[0].title);
      expect(session.pathIndex).toBe(0);
      expect(session.messages[0].content).toContain('main idea');
      const prompt = state.generate.mock.calls.at(-1)?.[0].config.systemInstruction as string;
      expect(prompt).toContain(`exactly ${length - 1} specific`);
      expect(prompt).toContain(level === 'kid' ? 'younger learner' : level === 'professional' ? 'fundamentals' : 'familiar');
    }
  });

  it('asks only from the current step, advances on a good explanation, and persists progress', async () => {
    const created = await create(endpoint('sessions', { topic: 'Photosynthesis', studentLevel: 'highschool' }));
    const initial = await created.json();
    state.generate.mockClear();
    const first = await chat(endpoint('chat', { sessionId: initial.id, content: 'Plants turn sunlight into chemical energy.', requestId: crypto.randomUUID(), expectedVersion: 0 }));
    expect(first.status).toBe(200);
    const firstResult = await first.json();
    expect(firstResult.session.pathIndex).toBe(1);
    expect(firstResult.session.masteryScore).toBe(20);
    expect(firstResult.reply).toContain('Next, Explain the main parts');
    const firstPrompt = state.generate.mock.calls[0][0].config.systemInstruction as string;
    expect(firstPrompt).toContain('CURRENT step is 1/5');
    expect(firstPrompt).toContain('Do not ask about later steps');
    expect(firstPrompt).toContain('high-school learner');
    await prisma.$disconnect();
    const reloaded = await prisma.session.findUniqueOrThrow({ where: { id: initial.id } });
    expect(reloaded.pathIndex).toBe(1);
    expect(reloaded.masteryScore).toBe(20);
    expect(parseLearningPath(reloaded.learningPath)?.at(-1)?.title).toBe('Deeper reasoning');
    state.generate.mockResolvedValueOnce({ text: JSON.stringify({ reply: 'Which key part supplies the energy?', score: 30, stepComplete: false }) });
    const second = await chat(endpoint('chat', { sessionId: initial.id, content: 'I am not sure about the parts.', requestId: crypto.randomUUID(), expectedVersion: 1 }));
    expect(second.status).toBe(200);
    const secondResult = await second.json();
    expect(secondResult.session.pathIndex).toBe(1);
    expect(secondResult.reply).toBe('Which key part supplies the energy?');
    expect(state.generate.mock.calls.at(-1)?.[0].config.systemInstruction).toContain('CURRENT step is 2/5');
  });

  it('unlocks the checkpoint without asking more lesson questions after every step is mastered', async () => {
    const created = await create(endpoint('sessions', { topic: 'Photosynthesis', studentLevel: 'kid' }));
    const session = await created.json();
    let version = 0;
    for (let step = 0; step < 4; step++) {
      const response = await chat(endpoint('chat', {
        sessionId: session.id, content: `Clear explanation for step ${step + 1}.`,
        requestId: crypto.randomUUID(), expectedVersion: version,
      }));
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.reply).not.toContain('?');
      version = result.session.version;
      if (step < 3) expect(result.session.pathIndex).toBe(step + 1);
      else {
        expect(result.session.status).toBe('checkpoint');
        expect(result.session.masteryScore).toBe(100);
        expect(result.reply).toContain('checkpoint is ready');
      }
    }
    const rejected = await chat(endpoint('chat', { sessionId: session.id, content: 'One more question?', requestId: crypto.randomUUID(), expectedVersion: version }));
    expect(rejected.status).toBe(409);
    const saved = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(saved.status).toBe('checkpoint');
    expect(saved.masteryScore).toBe(100);
  });

  it('does not save a session when the outline is malformed or repeats a step', async () => {
    state.generate.mockResolvedValueOnce({ text: JSON.stringify({ subtopics: generated(4).subtopics.slice(0, 1) }) });
    expect((await create(endpoint('sessions', { topic: 'Chemistry' }))).status).toBe(502);
    expect(await prisma.session.count()).toBe(0);

    const repeatedTitle = generated(4);
    repeatedTitle.subtopics[1].title = '  KEY   PARTS  ';
    state.generate.mockResolvedValueOnce({ text: JSON.stringify(repeatedTitle) });
    expect((await create(endpoint('sessions', { topic: 'Chemistry' }))).status).toBe(502);
    expect(await prisma.session.count()).toBe(0);

    const repeatedObjective = generated(4);
    repeatedObjective.subtopics[1].objective = '  EXPLAIN   THE MAIN PARTS OF THE TOPIC.  ';
    state.generate.mockResolvedValueOnce({ text: JSON.stringify(repeatedObjective) });
    expect((await create(endpoint('sessions', { topic: 'Chemistry' }))).status).toBe(502);
    expect(await prisma.session.count()).toBe(0);
  });

  it.each([
    { evaluation: 'vague', index: 0, score: 30, stepComplete: false, nextIndex: 0, complete: false, allComplete: false, masteryScore: 6 },
    { evaluation: 'off-topic despite a high score', index: 0, score: 90, stepComplete: false, nextIndex: 0, complete: false, allComplete: false, masteryScore: 18 },
    { evaluation: 'contradictory at the maximum score', index: 0, score: 100, stepComplete: false, nextIndex: 0, complete: false, allComplete: false, masteryScore: 20 },
    { evaluation: 'flagged complete below the threshold', index: 0, score: 69, stepComplete: true, nextIndex: 0, complete: false, allComplete: false, masteryScore: 14 },
    { evaluation: 'clear at the threshold', index: 0, score: 70, stepComplete: true, nextIndex: 1, complete: true, allComplete: false, masteryScore: 20 },
    { evaluation: 'clear and strong', index: 0, score: 90, stepComplete: true, nextIndex: 1, complete: true, allComplete: false, masteryScore: 20 },
    { evaluation: 'incomplete on the final step', index: 4, score: 100, stepComplete: false, nextIndex: 4, complete: false, allComplete: false, masteryScore: 99 },
    { evaluation: 'passing on the final step', index: 4, score: 70, stepComplete: true, nextIndex: 4, complete: true, allComplete: true, masteryScore: 100 },
  ])('handles a $evaluation evaluation consistently', ({ index, score, stepComplete, nextIndex, complete, allComplete, masteryScore }) => {
    const path = parseLearningPath(JSON.stringify([{ title: 'The basic idea', objective: 'Explain the first core idea.' }, ...generated(4).subtopics]))!;
    expect(advancePath(index, path, score, stepComplete)).toEqual({ nextIndex, complete, allComplete, masteryScore });
  });
});
