import { beforeEach, expect, it, vi } from 'vitest';
const authState = vi.hoisted(() => ({ id: null as string | null }));
vi.mock('@/auth', () => ({ auth: vi.fn(async () => authState.id ? { user: { id: authState.id } } : null) }));
vi.mock('@/lib/ai', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai')>(), generateJson: vi.fn(async () => ({
  summary: 'Your explanation connects the main ideas clearly.',
  conceptMap: { nodes: [{ id: 'a', label: 'Light energy', status: 'connected' }, { id: 'b', label: 'Sugar production', status: 'connected' }, { id: 'c', label: 'Plant growth', status: 'review' }], links: [{ from: 'a', to: 'b', label: 'Provides energy', status: 'connected' }, { from: 'b', to: 'c', label: 'Supports growth', status: 'review' }] },
  criteria: ['Accuracy', 'Coverage', 'Cause-and-effect reasoning', 'Clarity', 'Application'].map(name => ({ name, status: 'Partly demonstrated', evidence: 'Your answer mentions light and sugar.', nextStep: 'Explain how sugar supports plant growth.' })),
  firstReview: { stepIndex: 1, title: 'Follow the energy', explanation: 'Connect stored energy to respiration and growth.' },
})) }));
import { prisma } from '@/lib/prisma';
import { GET, POST } from '@/app/api/courses/sessions/route';
import { POST as openCheckpoint } from '@/app/api/courses/checkpoint/route';
import { POST as submitCheckpoint } from '@/app/api/sessions/[id]/checkpoint/route';
import { starterCourse } from '@/lib/starter-course';
import { flattenSessions } from '@/lib/course-sessions';
import { courseContentSchema, publicationProblem } from '@/lib/course-content';
import { sessionRevision } from '@/lib/course-session-server';
const sessions = flattenSessions(starterCourse.content);
const request = (body?: unknown, origin?: string) => new Request(`http://localhost:3000/api/courses/sessions?courseId=${starterCourse.id}`, body ? { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) } : undefined);
const answerFor = (index: number) => ({ courseId: starterCourse.id, sessionId: sessions[index].id, revision: sessionRevision(sessions[index]), answer: sessions[index].quiz!.answer });
beforeEach(async () => { await prisma.rateLimit.deleteMany(); await prisma.session.deleteMany(); await prisma.courseReadingProgress.deleteMany(); await prisma.user.deleteMany(); authState.id = null; });
async function account() { const user = await prisma.user.create({ data: { username: crypto.randomUUID(), password: 'test-only' } }); authState.id = user.id; return user.id; }
it('validates the entire starter curriculum and rejects malformed authored quizzes', () => {
  expect(courseContentSchema.safeParse(starterCourse.content).success).toBe(true);
  expect(publicationProblem(starterCourse.content)).toBeNull();
  const bad = structuredClone(starterCourse.content) as typeof starterCourse.content & { lessons: { sessions: typeof sessions }[] };
  bad.lessons[0].sessions[0].quiz!.answer = [crypto.randomUUID()];
  expect(courseContentSchema.safeParse(bad).success).toBe(false);
});
it('requires auth, rejects wrong answers, cross-origin requests, stale revisions and skipped sessions', async () => {
  expect((await GET(request())).status).toBe(401);
  expect((await POST(request(answerFor(0)))).status).toBe(401);
  await account();
  expect((await POST(request(answerFor(0), 'https://attacker.test'))).status).toBe(403);
  expect((await POST(request(answerFor(1)))).status).toBe(409);
  expect((await POST(request({ ...answerFor(0), answer: [sessions[0].quiz!.options[1].id] }))).status).toBe(400);
  expect((await POST(request({ ...answerFor(0), revision: '0'.repeat(64) }))).status).toBe(409);
  expect(await prisma.courseReadingProgress.count()).toBe(0);
});
it('persists five completed sessions, resumes one checkpoint, and unlocks the next group only after feedback', async () => {
  const owner = await account();
  expect((await openCheckpoint(request({ courseId: starterCourse.id, block: 0 }))).status).toBe(409);
  for (let i = 0; i < 5; i++) expect((await POST(request(answerFor(i)))).status).toBe(200);
  expect((await POST(request(answerFor(4)))).status).toBe(200);
  expect(await prisma.courseReadingProgress.count()).toBe(5);
  expect((await POST(request(answerFor(5)))).status).toBe(409);
  const first = await (await openCheckpoint(request({ courseId: starterCourse.id, block: 0 }))).json();
  const again = await (await openCheckpoint(request({ courseId: starterCourse.id, block: 0 }))).json();
  expect(first.id).toBe(again.id);
  const saved = await prisma.session.findUniqueOrThrow({ where: { id: first.id } });
  expect(saved.status).toBe('checkpoint'); expect(saved.masteryScore).toBe(0); expect(saved.courseContext).toContain('Light is energy');
  const result = await submitCheckpoint(request({ content: 'Light provides energy for making sugars from water and carbon dioxide.', requestId: crypto.randomUUID(), expectedVersion: 0 }), { params: Promise.resolve({ id: first.id }) });
  expect(result.status).toBe(200);
  expect((await result.json()).report.criteria).toHaveLength(5);
  expect((await POST(request(answerFor(5)))).status).toBe(200);
  await account(); expect((await (await GET(request())).json()).completed).toEqual([]);
  authState.id = owner; expect((await (await GET(request())).json()).completed).toHaveLength(6);
});
