// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import Courses from '@/app/courses/page';
import SessionPlayer from '@/components/learning-path/SessionPlayer';
import { starterCourse, starterSessions } from '@/lib/starter-course';
import { flattenSessions } from '@/lib/course-sessions';
const sessions = flattenSessions(starterCourse.content);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); push.mockReset(); });
function mockPath(completed: string[] = [], fail = false) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/courses/checkpoint') return Response.json({ id: 'checkpoint-1' });
    if (init?.method === 'POST') return fail ? Response.json({ error: 'Save unavailable.' }, { status: 503 }) : Response.json({ completed: [...completed, JSON.parse(String(init.body)).sessionId] });
    return Response.json(url === '/api/courses' ? [] : { completed, revisions: Object.fromEntries(sessions.map(session => [session.id, 'a'.repeat(64)])), checkpoints: [{ block: 0, id: null, status: 'locked' }, { block: 1, id: null, status: 'locked' }] });
  }));
}
async function startFirst() {
  await waitFor(() => expect(screen.queryByText('Loading your sessions…')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Start session: Light is energy' }));
}
it('shows topics with sessions, checks answers, and saves before unlocking the next session', async () => {
  mockPath(); render(<Courses />); await startFirst();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Light is energy');
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('See the idea in action')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Carbon atoms' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  expect(screen.getByRole('status').textContent).toContain('Not quite');
  expect(screen.queryByRole('button', { name: 'Complete session' })).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: 'Energy' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Complete session' }));
  await screen.findByRole('heading', { name: 'Session complete' });
  fireEvent.click(screen.getByRole('button', { name: 'Return to sessions' }));
  expect(screen.getByText('1 of 10 sessions complete')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Start session: Follow the energy' }) as HTMLButtonElement).disabled).toBe(false);
});
it('opens the direct checkpoint after five sessions and holds the next group until feedback', async () => {
  mockPath(sessions.slice(0, 5).map(session => session.id)); render(<Courses />);
  await waitFor(() => expect(screen.queryByText('Loading your sessions…')).toBeNull());
  expect((screen.getByRole('button', { name: 'Start session: Connect the processes' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getAllByRole('button', { name: 'Open checkpoint' })[0]);
  await waitFor(() => expect(push).toHaveBeenCalledWith('/chat/checkpoint-1'));
});
it('keeps quiz and answer available when saving fails', async () => {
  mockPath([], true); render(<Courses />); await startFirst();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Energy' })); fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Complete session' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Save unavailable.');
  expect((screen.getByRole('radio', { name: 'Energy' }) as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByRole('heading', { name: 'Session complete' })).toBeNull();
});
it('supports guest theory, example and quiz without claiming to save progress', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Sign in' }, { status: 401 })));
  render(<Courses />); await screen.findByRole('link', { name: 'Sign in to save your progress' }); await startFirst();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Energy' })); fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  expect(screen.getByRole('link', { name: 'Sign in to save progress' }).getAttribute('href')).toBe('/login');
});
it('supports keyboard-accessible ordering and matching quizzes', async () => {
  const props = { topic: 'Photosynthesis', number: 2, total: 10, guest: false, onExit: vi.fn(), onComplete: vi.fn().mockResolvedValue(true), error: '' };
  const view = render(<SessionPlayer {...props} session={starterSessions[1]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move Light is absorbed up' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move Light is absorbed up' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move Energy is stored in sugars up' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  expect(screen.getByRole('status').textContent).toContain('That’s right');
  view.unmount(); render(<SessionPlayer {...props} session={starterSessions[3]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  starterSessions[3].quiz!.targets!.forEach((target, index) => fireEvent.change(screen.getByLabelText(target), { target: { value: starterSessions[3].quiz!.answer[index] } }));
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  expect(screen.getByRole('status').textContent).toContain('That’s right');
});
