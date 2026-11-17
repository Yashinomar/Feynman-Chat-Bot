// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatArea from '../src/components/ChatArea';
import { RequestError, requestJson, studySessionSchema } from '../src/lib/client-api';
import { z } from 'zod';

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('message save feedback', () => {
  it('keeps a draft when the server has not confirmed persistence', async () => {
    const send = vi.fn().mockResolvedValue(false);
    render(<ChatArea topic="Biology" messages={[]} onSendMessage={send} isLoading={false} />);
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Plants use sunlight.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('Plants use sunlight.'));
    expect(input.value).toBe('Plants use sunlight.');
  });

  it('clears the draft only after the save resolves successfully', async () => {
    let resolveSave!: (saved: boolean) => void;
    const send = vi.fn(() => new Promise<boolean>(resolve => { resolveSave = resolve; }));
    render(<ChatArea topic="Biology" messages={[]} onSendMessage={send} isLoading={false} />);
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Plants use sunlight.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('Plants use sunlight.');
    await act(async () => { resolveSave(true); });
    expect(input.value).toBe('');
  });

  it('keeps the draft and explains an unexpected save failure', async () => {
    render(<ChatArea topic="Biology" messages={[]} onSendMessage={vi.fn().mockRejectedValue(new Error('offline'))} isLoading={false} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Try again' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect((await screen.findByRole('alert')).textContent).toContain('draft has been kept');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Try again');
  });
});

describe('client API boundary', () => {
  it('rejects a failed HTTP write even if the network request resolves', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Could not save' }), { status: 500 })));
    await expect(requestJson('/api/chat', z.object({ success: z.boolean() }))).rejects.toMatchObject({ status: 500, message: 'Could not save' });
  });
  it('rejects invalid returned mastery rather than rendering a false success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 's', topic: 'test', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', messages: [], status: 'active', version: 1, masteryScore: 101 }))));
    await expect(requestJson('/api/sessions/s', studySessionSchema)).rejects.toBeInstanceOf(RequestError);
  });
});

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'study-1' }), useRouter: () => navigation }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated' }) }));
import ChatSession from '../src/app/chat/[id]/page';
import Library from '../src/app/library/page';
import Home from '../src/app/page';

const initial = { id: 'study-1', topic: 'Biology', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', messages: [], status: 'active', version: 0, masteryScore: 0, reviewDate: null };

it('retries the same chat turn after an ambiguous failure and renders only the committed result', async () => {
  const saved = { ...initial, version: 1, masteryScore: 80, reviewDate: '2026-01-02T00:00:00.000Z', messages: [{ id: 'm1', role: 'user', content: 'Plants use sunlight.' }, { id: 'm2', role: 'ai', content: 'What do they produce?' }] };
  const turns: string[] = [];
  const checks: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/chat') {
      turns.push(String(init?.body));
      if (turns.length === 1) throw new TypeError('Lost connection');
      return new Response(JSON.stringify({ session: saved, reply: 'What do they produce?', score: 80, sources: [] }));
    }
    if (url === '/api/factcheck') {
      checks.push(String(init?.body));
      return Response.json({ status: 'unverified', reason: 'No matching source was found.' });
    }
    return new Response(JSON.stringify(initial));
  }));
  render(<ChatSession />);
  const input = await screen.findByRole('textbox') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: 'Plants use sunlight.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('What do they produce?')).toBeNull();
  expect(screen.getByText('0%')).toBeTruthy();
  expect(input.value).toBe('Plants use sunlight.');
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText('What do they produce?')).toBeTruthy();
  expect(turns).toHaveLength(2);
  expect(JSON.parse(turns[0])).toEqual(JSON.parse(turns[1]));
  expect(JSON.parse(turns[1])).toMatchObject({ expectedVersion: 0, sessionId: 'study-1' });
  expect(screen.getByText('80%')).toBeTruthy();
  expect(screen.getByText(/Next review:/)).toBeTruthy();
  expect(await screen.findByText(/Could not verify this explanation/)).toBeTruthy();
  expect(checks.map(body => JSON.parse(body))).toEqual([
    { sessionId: 'study-1', requestId: JSON.parse(turns[0]).requestId, expectedVersion: 1 },
  ]);
  expect(input.value).toBe('');
});


it('shows the saved learning path and the current step after a reload', async () => {
  const learningPath = JSON.stringify([
    { title: 'The basic idea', objective: 'Explain what Photosynthesis is in simple words.' },
    { title: 'Key parts', objective: 'Explain how plants use light, water, and air.' },
    { title: 'How it works', objective: 'Explain how plants make stored energy.' },
    { title: 'An example', objective: 'Explain a concrete plant example.' },
    { title: 'Deeper reasoning', objective: 'Explain a limitation of this model.' },
  ]);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    id: 'study-1', topic: 'Photosynthesis', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [], status: 'active', version: 1, masteryScore: 20, reviewDate: null, studentLevel: 'highschool',
    learningPath, pathIndex: 1,
  }))));
  render(<ChatSession />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Photosynthesis' })).toBeTruthy();
  const route = screen.getByRole('heading', { name: 'Build the idea step by step' }).closest('section');
  expect(route).not.toBeNull();
  expect(route!.textContent).toContain('The basic idea');
  expect(route!.textContent).toContain('Deeper reasoning');
  expect(within(route!).getByText('Key parts').closest('li')?.getAttribute('aria-current')).toBe('step');
  expect(screen.getByRole('progressbar', { name: '20% of lessons complete' }).getAttribute('aria-valuenow')).toBe('20');
  expect(screen.getAllByText('Explain how plants use light, water, and air.')).toHaveLength(2);
});

it('ignores fact checks for replays returned with a newer session snapshot', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/chat') {
      return Response.json({ session: { ...initial, version: 2 }, reply: 'Saved reply.', score: 20, replayed: true });
    }
    return Response.json(initial);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<ChatSession />);
  const input = await screen.findByRole('textbox') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: 'An earlier explanation.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(input.value).toBe(''));
  expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/factcheck');
});

it('reloads the latest correction when a stale dismissal is rejected', async () => {
  const requests: RequestInit[] = [];
  const existing = { ...initial, version: 1, activeCorrection: 'Earlier correction.' };
  const newer = { ...existing, version: 2, activeCorrection: 'Newer correction.' };
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      requests.push(init);
      return Response.json({ error: 'The session changed.' }, { status: 409 });
    }
    return Response.json(requests.length ? newer : existing);
  }));
  render(<ChatSession />);
  expect(await screen.findByText('Earlier correction.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss correction' }));
  expect(await screen.findByText('Newer correction.')).toBeTruthy();
  expect(requests.map(request => JSON.parse(String(request.body)))).toEqual([{ activeCorrection: null, expectedVersion: 1 }]);
  expect(screen.getByRole('alert').textContent).toContain('The session changed.');
});

it('protects Library deletion with cancel, a pending lock, and an in-place failure', async () => {
  let finishDelete!: (response: Response) => void;
  const remove = vi.fn(() => new Promise<Response>(resolve => { finishDelete = resolve; }));
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    return init?.method === 'DELETE' ? remove() : Response.json([initial]);
  }));
  render(<Library />);
  const trigger = await screen.findByRole('button', { name: 'Delete Biology' });
  expect(screen.getByRole('link', { name: 'Resume Biology' }).getAttribute('href')).toBe('/chat/study-1');
  fireEvent.click(trigger);
  let dialog = screen.getByRole('dialog', { name: 'Delete Biology?' });
  const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
  expect(document.activeElement).toBe(cancel);
  fireEvent.click(cancel);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(remove).not.toHaveBeenCalled();

  fireEvent.click(trigger);
  dialog = screen.getByRole('dialog', { name: 'Delete Biology?' });
  const confirm = within(dialog).getByRole('button', { name: 'Delete session' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(remove).toHaveBeenCalledTimes(1);
  await act(async () => finishDelete(Response.json({ error: 'Deletion unavailable.' }, { status: 500 })));
  expect(within(dialog).getByRole('alert').textContent).toBe('Deletion unavailable.');
  expect(screen.getByRole('link', { name: 'Resume Biology' })).toBeTruthy();

  fireEvent.click(confirm);
  await act(async () => finishDelete(Response.json({ success: true })));
  expect(screen.queryByRole('link', { name: 'Resume Biology' })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Topic Library' }));
});

it('opens the same confirmation from chat and dismisses it without deleting', async () => {
  const fetchMock = vi.fn(async () => Response.json(initial));
  vi.stubGlobal('fetch', fetchMock);
  render(<ChatSession />);
  const trigger = await screen.findByRole('button', { name: 'Delete Session' });
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Delete Biology?' });
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('focuses Home on the learning path without the removed mode launchers', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<Home />);
  expect(screen.getByRole('link', { name: 'Open my learning path' }).getAttribute('href')).toBe('/courses');
  expect(screen.getByRole('link', { name: 'Open saved practice' }).getAttribute('href')).toBe('/library');
  expect(screen.queryByText(/Solo Study|Co-Op Multiplayer|RAG Notes Study|Knowledge Quiz/)).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('names the Learn dialog and returns focus to its trigger on Escape', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ title: 'Biology', extract: 'Biology is the study of life.' })));
  render(<ChatArea topic="Biology" messages={[]} onSendMessage={vi.fn()} isLoading={false} />);
  const trigger = screen.getByRole('button', { name: 'Learn' });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Biology' });
  const close = within(dialog).getByRole('button', { name: 'Close Wikipedia' });
  expect(document.activeElement).toBe(close);
  const article = within(dialog).getByRole('link', { name: 'Read full article' });
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(article);
  fireEvent.keyDown(article, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(document.activeElement).toBe(trigger);
});

it('keeps both directions of Tab on Learn’s only control when the source fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 404 })));
  render(<ChatArea topic="Biology" messages={[]} onSendMessage={vi.fn()} isLoading={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
  const dialog = screen.getByRole('dialog', { name: 'Wikipedia' });
  await within(dialog).findByRole('alert');
  const close = within(dialog).getByRole('button', { name: 'Close Wikipedia' });
  expect(fireEvent.keyDown(close, { key: 'Tab' })).toBe(false);
  expect(document.activeElement).toBe(close);
  expect(fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })).toBe(false);
  expect(document.activeElement).toBe(close);
});
