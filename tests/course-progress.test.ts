import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('@/auth', () => ({ auth: vi.fn(async () => state.userId ? { user: { id: state.userId } } : null) }));
import { prisma } from '@/lib/prisma';
import { GET, POST } from '@/app/api/courses/progress/route';
import { starterCourse } from '@/lib/starter-course';

const request = (body?: unknown, origin?: string) => new Request('http://localhost:3000/api/courses/progress', body ? { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) } : undefined);
beforeEach(async () => { await prisma.rateLimit.deleteMany(); await prisma.courseReadingProgress.deleteMany(); await prisma.course.deleteMany(); await prisma.user.deleteMany(); state.userId = null; });
async function account() { const user = await prisma.user.create({ data: { username: crypto.randomUUID(), password: 'test-only' } }); state.userId = user.id; return user; }
it('requires an account, rejects cross-origin writes and unknown lessons', async () => {
  expect((await GET(request())).status).toBe(401);
  const body = { courseId: starterCourse.id, lessonId: starterCourse.content.lessons[0].id };
  expect((await POST(request(body))).status).toBe(401);
  await account();
  expect((await POST(request(body, 'https://attacker.test'))).status).toBe(403);
  expect((await POST(request({ ...body, lessonId: crypto.randomUUID() }))).status).toBe(404);
});
it('saves reading idempotently and isolates student progress', async () => {
  const owner = await account();
  const body = { courseId: starterCourse.id, lessonId: starterCourse.content.lessons[0].id };
  expect((await POST(request(body))).status).toBe(200);
  expect((await POST(request(body))).status).toBe(200);
  expect(await prisma.courseReadingProgress.count()).toBe(1);
  expect((await (await GET(request())).json()).length).toBe(1);
  await account(); expect(await (await GET(request())).json()).toEqual([]);
  state.userId = owner.id; expect((await (await GET(request())).json()).length).toBe(1);
});
it('invalidates changed lessons and excludes unpublished courses', async () => {
  await account();
  const course = await prisma.course.create({ data: { id: crypto.randomUUID(), title: 'Test', draft: JSON.stringify(starterCourse.content), published: JSON.stringify(starterCourse.content) } });
  const body = { courseId: course.id, lessonId: starterCourse.content.lessons[0].id };
  expect((await POST(request(body))).status).toBe(200);
  const revised = structuredClone(starterCourse.content); revised.lessons[0].body += ' New example.';
  await prisma.course.update({ where: { id: course.id }, data: { published: JSON.stringify(revised) } });
  expect(await (await GET(request())).json()).toEqual([]);
  expect((await POST(request(body))).status).toBe(200);
  await prisma.course.update({ where: { id: course.id }, data: { published: null } });
  expect(await (await GET(request())).json()).toEqual([]);
  expect((await POST(request(body))).status).toBe(404);
});
