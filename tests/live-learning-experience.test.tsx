// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiveLearningExperience from '../src/components/learning-path/LiveLearningExperience';
import type { CheckpointReport } from '../src/lib/checkpoint-report';

const navigation = vi.hoisted(() => ({ push: vi.fn(), currentId: 'study-1' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: navigation.currentId }), useRouter: () => navigation }));
import ChatSession from '../src/app/chat/[id]/page';

const path = [
  { title: 'The basic idea', objective: 'Explain the main idea clearly in your own words.' },
  { title: 'Key parts', objective: 'Explain the important parts and what each part does.' },
  { title: 'How it works', objective: 'Explain how the important parts work together.' },
  { title: 'An example', objective: 'Apply the idea to a clear and concrete example.' },
  { title: 'Deeper reasoning', objective: 'Explain one limitation or more difficult connection.' },
];

const report: CheckpointReport = {
  schemaVersion: 1,
  requestId: '026d90b8-4b80-4f36-a1aa-7f0ccf7ab9e5',
  generatedAt: '2026-11-13T12:00:00.000Z',
  summary: 'The core idea is clear, while one cause-and-effect connection needs review.',
  conceptMap: {
    nodes: [
      { id: 'inputs', label: 'Inputs create stored energy', status: 'connected' },
      { id: 'growth', label: 'Stored energy supports growth', status: 'connected' },
      { id: 'limit', label: 'A limited input slows the process', status: 'review' },
    ],
    links: [
      { from: 'inputs', to: 'growth', label: 'Energy supports growth', status: 'connected' },
      { from: 'growth', to: 'limit', label: 'The limiting link needs review', status: 'review' },
    ],
  },
  criteria: [
    { name: 'Accuracy', status: 'Demonstrated', evidence: 'The core process is described accurately.', nextStep: 'Keep the same precise description.' },
    { name: 'Coverage', status: 'Partly demonstrated', evidence: 'Most important parts are included.', nextStep: 'Add the missing output.' },
    { name: 'Cause-and-effect reasoning', status: 'Partly demonstrated', evidence: 'One causal connection is present.', nextStep: 'Connect the limiting input to the outcome.' },
    { name: 'Clarity', status: 'Demonstrated', evidence: 'The explanation uses clear everyday language.', nextStep: 'Keep using short direct sentences.' },
    { name: 'Application', status: 'Needs practice', evidence: 'The changed condition is not used.', nextStep: 'Apply the limiting factor to the prediction.' },
  ],
  firstReview: { stepIndex: 2, title: 'Reconnect cause and effect', explanation: 'Review how the parts work together before trying again.' },
};

const base = {
  topic: 'Photosynthesis',
  levelLabel: 'High School',
  learningPath: path,
  currentStep: 2,
  masteryScore: 48,
  messages: [{ id: 'm1', role: 'ai' as const, content: 'Explain the key parts.' }],
  report: null,
  isSubmitting: false,
  onFocusExplanation: vi.fn(),
  onSubmitCheckpoint: vi.fn().mockResolvedValue(false),
  onReturnToLibrary: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  navigation.currentId = 'study-1';
});

describe('live learning experience', () => {
  it('shows the real topic, current lesson, accessible progress, and locked checkpoint', () => {
    const focus = vi.fn();
    render(<LiveLearningExperience {...base} status="active" onFocusExplanation={focus} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Photosynthesis' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'How it works' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '40% of lessons complete' }).getAttribute('aria-valuenow')).toBe('40');
    const checkpoint = screen.getByText('Feynman checkpoint').closest('li');
    expect(checkpoint).not.toBeNull();
    expect(within(checkpoint!).getByText('Locked')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Explain this step/i }));
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('keeps an editable checkpoint draft when submission is not confirmed', async () => {
    const submit = vi.fn().mockResolvedValue(false);
    render(<LiveLearningExperience {...base} status="checkpoint" currentStep={4} masteryScore={100} onSubmitCheckpoint={submit} checkpointError="The service is temporarily unavailable. Your checkpoint draft has been kept." />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Teach Photosynthesis back' }));
    const input = screen.getByRole('textbox', { name: 'Your checkpoint explanation' }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Plants use inputs to make stored energy.' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit explanation/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith('Plants use inputs to make stored energy.'));
    expect(input.value).toBe('Plants use inputs to make stored energy.');
    expect(screen.getByRole('alert').textContent).toContain('draft has been kept');
    fireEvent.click(screen.getByText('Previous lesson conversation'));
    expect(screen.getByText(/Explain the key parts/)).toBeTruthy();
  });

  it('renders all persisted criteria and opens the persisted review step', () => {
    const returnToLibrary = vi.fn();
    render(<LiveLearningExperience {...base} status="completed" currentStep={4} masteryScore={100} report={report} onReturnToLibrary={returnToLibrary} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Your teach-back report' })).toBeTruthy();
    expect(screen.getByText(report.summary)).toBeTruthy();
    const connections = screen.getByRole('list', { name: 'Concept connections' });
    expect(within(connections).getByText('Energy supports growth')).toBeTruthy();
    expect(within(connections).getByText('The limiting link needs review')).toBeTruthy();
    expect(within(connections).getByText('Inputs create stored energy')).toBeTruthy();
    expect(within(connections).getByText('A limited input slows the process')).toBeTruthy();
    for (const criterion of report.criteria) {
      const row = screen.getByRole('heading', { name: criterion.name }).closest('article');
      expect(row).not.toBeNull();
      expect(within(row!).getByText(criterion.evidence)).toBeTruthy();
      expect(within(row!).getByText(criterion.nextStep)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Review lesson 3' }));
    expect(screen.getByRole('heading', { level: 1, name: 'How it works' })).toBeTruthy();
    expect(screen.getByText(path[2].objective)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Return to report/i }));
    expect(screen.getByRole('heading', { level: 1, name: 'Your teach-back report' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Return to library/i }));
    expect(returnToLibrary).toHaveBeenCalledTimes(1);
  });

  it('warns without hiding the legacy conversation when a stored report is invalid', () => {
    render(<LiveLearningExperience {...base} status="completed" reportUnavailable />);
    expect(screen.getByRole('alert').textContent).toContain('saved feedback report is unavailable');
  });

  it('retries a live checkpoint with the same request body and renders the saved report', async () => {
    const learningPath = JSON.stringify(path);
    const checkpointSession = {
      id: 'study-1', topic: 'Photosynthesis', createdAt: '2026-11-13T12:00:00.000Z', updatedAt: '2026-11-13T12:00:00.000Z',
      messages: [], status: 'checkpoint', version: 4, masteryScore: 100, reviewDate: null, studentLevel: 'highschool',
      learningPath, pathIndex: 4, checkpointReport: null,
    } as const;
    const completedSession = {
      ...checkpointSession, status: 'completed', version: 5, checkpointReport: JSON.stringify(report),
      messages: [
        { id: 'checkpoint-answer', role: 'user', content: 'My connected explanation.' },
        { id: 'checkpoint-report', role: 'ai', content: report.summary },
      ],
    } as const;
    const submissions: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/sessions/study-1/checkpoint') {
        submissions.push(String(init?.body));
        if (submissions.length === 1) throw new TypeError('Connection lost');
        return Response.json({ session: completedSession, report });
      }
      return Response.json(checkpointSession);
    }));

    render(<ChatSession />);
    const input = await screen.findByRole('textbox', { name: 'Your checkpoint explanation' }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'My connected explanation.' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit explanation/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('draft has been kept');
    expect(input.value).toBe('My connected explanation.');
    fireEvent.click(screen.getByRole('button', { name: /Submit explanation/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your teach-back report' })).toBeTruthy();
    expect(submissions).toHaveLength(2);
    expect(JSON.parse(submissions[0])).toEqual(JSON.parse(submissions[1]));
    expect(JSON.parse(submissions[0])).toMatchObject({ content: 'My connected explanation.', expectedVersion: 4 });
  });

  it('ignores a checkpoint response that arrives after navigation to another session', async () => {
    const learningPath = JSON.stringify(path);
    const first = {
      id: 'study-1', topic: 'Photosynthesis', createdAt: '2026-11-13T12:00:00.000Z', updatedAt: '2026-11-13T12:00:00.000Z',
      messages: [], status: 'checkpoint', version: 4, masteryScore: 100, reviewDate: null, studentLevel: 'highschool',
      learningPath, pathIndex: 4, checkpointReport: null,
    } as const;
    const second = {
      ...first, id: 'study-2', topic: 'Physics', status: 'active', version: 0, masteryScore: 0, pathIndex: 0,
    } as const;
    let resolveSubmission!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/sessions/study-1/checkpoint') {
        return new Promise<Response>(resolve => { resolveSubmission = resolve; });
      }
      if (url === '/api/sessions/study-2') return Response.json(second);
      return Response.json(first);
    }));

    const view = render(<ChatSession />);
    const input = await screen.findByRole('textbox', { name: 'Your checkpoint explanation' });
    fireEvent.change(input, { target: { value: 'A delayed checkpoint explanation.' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit explanation/i }));
    await waitFor(() => expect(resolveSubmission).toBeTypeOf('function'));

    navigation.currentId = 'study-2';
    view.rerender(<ChatSession />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Physics' })).toBeTruthy();

    await act(async () => resolveSubmission(Response.json({
      session: { ...first, status: 'completed', version: 5, checkpointReport: JSON.stringify(report) },
      report,
    })));
    expect(screen.getByRole('heading', { level: 1, name: 'Physics' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'Your teach-back report' })).toBeNull();
  });

  it('explains why a saved report cannot open when its learning path is damaged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      id: 'study-1', topic: 'Photosynthesis', createdAt: '2026-11-13T12:00:00.000Z', updatedAt: '2026-11-13T12:00:00.000Z',
      messages: [{ id: 'saved-message', role: 'ai', content: 'Your saved lesson conversation.' }],
      status: 'completed', version: 5, masteryScore: 100, reviewDate: null, studentLevel: 'highschool',
      learningPath: '{damaged', pathIndex: 4, checkpointReport: JSON.stringify(report),
    })));

    render(<ChatSession />);
    expect((await screen.findByRole('alert')).textContent).toContain('report is unavailable because its learning path could not be loaded');
    expect(screen.getByText('Your saved lesson conversation.')).toBeTruthy();
  });
});
