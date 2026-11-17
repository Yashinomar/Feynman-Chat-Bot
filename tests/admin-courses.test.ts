import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('@/auth', () => ({ auth: vi.fn(async () => state.userId ? { user: { id: state.userId } } : null) }));
import { prisma } from '@/lib/prisma';
import { GET, PUT } from '@/app/api/admin/courses/route';
import { GET as catalog } from '@/app/api/courses/route';

const content = { title: 'Photosynthesis', description: 'How plants grow', level: 'highschool', lessons: [{ id: crypto.randomUUID(), title: 'Light', body: 'Light supplies energy.', sublessons: [{ id: crypto.randomUUID(), title: 'Chlorophyll', body: 'Chlorophyll absorbs light.' }] }] };
const request = (body?: unknown, origin?: string) => new Request('http://localhost:3000/api/admin/courses', body ? { method: 'PUT', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) } : undefined);
beforeEach(async () => {
  await prisma.rateLimit.deleteMany(); await prisma.course.deleteMany();
  await prisma.session.deleteMany(); await prisma.user.deleteMany(); state.userId = null;
});
async function account(role: string) { const user = await prisma.user.create({ data: { username: crypto.randomUUID(), password: 'test-only', role } }); state.userId = user.id; return user; }
describe('admin course publishing', () => {
  it('requires a current administrator role and rejects cross-origin writes', async () => {
    expect((await GET(request())).status).toBe(401);
    const input = { id: crypto.randomUUID(), expectedVersion: -1, action: 'save', content };
    await account('USER'); expect((await PUT(request(input))).status).toBe(403);
    const admin = await account('ADMIN'); expect((await PUT(request(input, 'https://attacker.test'))).status).toBe(403);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
    expect((await GET(request())).status).toBe(403);
  });
  it('isolates drafts, publishes complete content, protects newer edits and unpublishes', async () => {
    await account('ADMIN');
    const input = { id: crypto.randomUUID(), expectedVersion: -1, action: 'save', content };
    expect((await PUT(request(input))).status).toBe(200);
    expect(await (await catalog(request())).json()).toEqual([]);
    expect((await PUT(request({ ...input, expectedVersion: 0, action: 'publish' }))).status).toBe(200);
    const edited = { ...content, title: 'Changed draft' };
    expect((await PUT(request({ ...input, expectedVersion: 1, content: edited }))).status).toBe(200);
    expect((await (await catalog(request())).json())[0].content.title).toBe('Photosynthesis');
    expect((await PUT(request({ ...input, expectedVersion: 1, content: { ...content, title: 'Stale edit' } }))).status).toBe(409);
    expect((await PUT(request({ ...input, expectedVersion: 1, content: edited }))).status).toBe(200);
    expect((await PUT(request({ ...input, expectedVersion: 2, content: edited, action: 'unpublish' }))).status).toBe(200);
    expect(await (await catalog(request())).json()).toEqual([]);
    expect((await prisma.course.findUniqueOrThrow({ where: { id: input.id } })).draft).toContain('Changed draft');
  });
  it('rejects empty published lessons, repeated IDs and unsupported fields', async () => {
    await account('ADMIN'); const input = { id: crypto.randomUUID(), expectedVersion: -1, action: 'publish', content };
    expect((await PUT(request({ ...input, content: { ...content, lessons: [] } }))).status).toBe(400);
    expect((await PUT(request({ ...input, content: { ...content, lessons: [{ ...content.lessons[0], body: '' }] } }))).status).toBe(400);
    expect((await PUT(request({ ...input, content: { ...content, lessons: [content.lessons[0], content.lessons[0]] } }))).status).toBe(400);
    expect((await PUT(request({ ...input, role: 'ADMIN' }))).status).toBe(400);
    expect(await prisma.course.count()).toBe(0);
  });
});
