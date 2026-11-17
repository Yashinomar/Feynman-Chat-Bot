import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ userId: '', generateContent: vi.fn(), embedContent: vi.fn() }));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: mocks.userId } }) }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class {
  models = { generateContent: mocks.generateContent, embedContent: mocks.embedContent };
} }));

import { prisma } from '@/lib/prisma';
import { POST as create } from '@/app/api/sessions/route';
import { PUT as update } from '@/app/api/sessions/[id]/route';
import { POST as upload } from '@/app/api/rag/route';
import { POST as chat } from '@/app/api/chat/route';
import { pathSchema } from '@/lib/learning-path';

const outline = { subtopics: [
  { title: 'Key parts', objective: 'Describe the parts of the idea.' },
  { title: 'How it works', objective: 'Describe how the parts fit together.' },
  { title: 'An example', objective: 'Show an example in everyday life.' },
  { title: 'Deeper reasoning', objective: 'Explain where the simple model breaks.' },
] };
const evaluation = { text: '{"reply":"Could you explain one more part?","score":45,"stepComplete":false}' };

function request(body: unknown, method = 'POST') {
  return new Request('http://localhost:3000/api/test', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function send(sessionId: string, expectedVersion: number) {
  return chat(request({ sessionId, expectedVersion, requestId: crypto.randomUUID(), content: 'Here is a partial explanation.' }));
}

beforeEach(async () => {
  process.env.GEMINI_API_KEY = 'controlled-test-key';
  mocks.generateContent.mockReset().mockImplementation(async ({ config }: { config: { systemInstruction: string } }) => (
    config.systemInstruction.startsWith('Design an ordered Feynman') ? { text: JSON.stringify(outline) } : evaluation
  ));
  mocks.embedContent.mockReset().mockImplementation(async ({ contents }: { contents: string[] }) => ({
    embeddings: contents.map(() => ({ values: [1, 0] })),
  }));
  await prisma.rateLimit.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  mocks.userId = (await prisma.user.create({ data: { username: 'topic-owner', password: 'test-only' } })).id;
});

describe('topic length compatibility and safe updates', () => {
  it.each([168, 169, 200, 201])('handles %i characters consistently for solo and notes sessions', async length => {
    const topic = 'x'.repeat(length);
    const solo = await create(request({ topic }));
    const notes = await upload(request({ topic, documentText: 'This is a synthetic example of notes on the selected topic.' }));
    if (length > 200) {
      expect(solo.status).toBe(400);
      expect(notes.status).toBe(400);
      expect(await prisma.session.count()).toBe(0);
      expect(mocks.generateContent).not.toHaveBeenCalled();
      expect(mocks.embedContent).not.toHaveBeenCalled();
      return;
    }
    expect(solo.status).toBe(201);
    expect(notes.status).toBe(201);
    for (const { learningPath, topic: storedTopic } of await prisma.session.findMany()) {
      expect(storedTopic).toBe(topic);
      const path = pathSchema.parse(JSON.parse(learningPath!));
      expect(path).toHaveLength(5);
      expect(path[0].objective).toMatch(/^Explain what /);
    }
  });

  it('saves a bounded path for a legacy session and can use it on a second turn', async () => {
    const session = await prisma.session.create({ data: { userId: mocks.userId, topic: 'x'.repeat(200) } });
    expect((await send(session.id, 0)).status).toBe(200);
    await prisma.$disconnect();
    const saved = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(pathSchema.parse(JSON.parse(saved.learningPath!))).toHaveLength(5);
    expect((await send(session.id, saved.version)).status).toBe(200);
  });

  it('recognizes a previously saved oversized fallback path without resetting its progress', async () => {
    const topic = 'x'.repeat(200);
    const oldPath = [
      { title: 'The basic idea', objective: `Explain what ${topic} is and why it matters in simple words.` },
      { title: 'Key parts', objective: `Explain the main parts or ideas that make up ${topic}.` },
      { title: 'How it works', objective: `Explain how those parts work together in ${topic}.` },
      { title: 'An example', objective: `Show a concrete example of ${topic} in use.` },
      { title: 'Deeper reasoning', objective: `Explain a limitation, exception, or more advanced aspect of ${topic}.` },
    ];
    const session = await prisma.session.create({ data: {
      userId: mocks.userId, topic, learningPath: JSON.stringify(oldPath), pathIndex: 2, version: 3,
    } });
    expect((await send(session.id, 3)).status).toBe(200);
    const saved = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    const path = pathSchema.parse(JSON.parse(saved.learningPath!));
    expect(path.map(step => step.title)).toEqual(oldPath.map(step => step.title));
    expect(saved.pathIndex).toBe(2);

    oldPath[2].objective = 'A malformed unrelated objective.'.repeat(20);
    await prisma.session.update({ where: { id: session.id }, data: { learningPath: JSON.stringify(oldPath) } });
    expect((await send(session.id, saved.version)).status).toBe(503);
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it('discards an in-flight answer when a pristine session is renamed before the turn commits', async () => {
    const session = await prisma.session.create({ data: { userId: mocks.userId, topic: 'Old topic' } });
    let modelEntered!: () => void;
    let releaseModel!: () => void;
    const entered = new Promise<void>(resolve => { modelEntered = resolve; });
    const release = new Promise<void>(resolve => { releaseModel = resolve; });
    mocks.generateContent.mockImplementationOnce(async () => {
      modelEntered();
      await release;
      return evaluation;
    });
    const pending = send(session.id, 0);
    await entered;
    try {
      const renamed = await update(request({ topic: 'New topic' }, 'PUT'), { params: Promise.resolve({ id: session.id }) });
      expect(renamed.status).toBe(200);
    } finally {
      releaseModel();
    }
    expect((await pending).status).toBe(409);
    expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id }, include: { messages: true } })).toMatchObject({
      topic: 'New topic', version: 1, pathIndex: 0, masteryScore: 0, learningPath: null, messages: [],
    });
  });
});
