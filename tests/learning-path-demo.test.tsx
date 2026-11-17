// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LearningPathDemo from '../src/app/learning-path-demo/page';

const predefinedAnswer =
  'Leaves use light energy, water, and carbon dioxide to make sugar. The sugar helps the plant grow. I think both seedlings would grow at the same rate because they get the same light.';

const rubric = [
  {
    name: 'Accuracy',
    evidence: 'You correctly described what leaves use to make sugar.',
    nextStep: 'Keep this precise description in your next explanation.',
  },
  {
    name: 'Coverage',
    evidence: 'You covered the inputs and sugar.',
    nextStep: 'Add what the plant releases during photosynthesis.',
  },
  {
    name: 'Cause-and-effect reasoning',
    evidence: 'You linked sugar to growth.',
    nextStep: 'Explain how less carbon dioxide affects how much sugar the plant can make.',
  },
  {
    name: 'Clarity',
    evidence: 'You used plain language and kept your explanation easy to follow.',
    nextStep: 'Keep using short sentences and familiar words.',
  },
  {
    name: 'Application',
    evidence: 'You held light constant, but did not use carbon dioxide in the prediction.',
    nextStep: 'Predict what happens when carbon dioxide becomes the limiting factor.',
  },
] as const;

beforeEach(() => {
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function completeLessonFive() {
  fireEvent.click(screen.getByRole('button', { name: /Open lesson five/i }));
  fireEvent.click(screen.getByRole('radio', { name: 'Oxygen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  fireEvent.click(screen.getByRole('button', { name: /Complete lesson five/i }));
}

function openReport() {
  completeLessonFive();
  fireEvent.click(screen.getByRole('button', { name: /Open Feynman checkpoint/i }));
  fireEvent.click(screen.getByRole('button', { name: /Submit explanation/i }));
}

describe('Feyman learning-path demo', () => {
  it('starts with four completed lessons, lesson five ready, and the checkpoint locked', () => {
    render(<LearningPathDemo />);

    expect(screen.getByRole('heading', { name: 'Build understanding one step at a time' })).toBeTruthy();
    expect(screen.getAllByText('Complete')).toHaveLength(4);
    expect(screen.getByText('Up next')).toBeTruthy();
    expect(screen.getByText('4 / 5')).toBeTruthy();
    expect(screen.getByLabelText('80% of Unit 1 complete')).toBeTruthy();

    const checkpoint = screen.getByText('Feynman checkpoint').closest('li');
    expect(checkpoint).not.toBeNull();
    expect(within(checkpoint!).getByText('Locked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open Feynman checkpoint/i })).toBeNull();
  });

  it('keeps the checkpoint locked after a wrong answer and unlocks it after the correct answer', () => {
    render(<LearningPathDemo />);

    fireEvent.click(screen.getByRole('button', { name: /Open lesson five/i }));
    fireEvent.click(screen.getByRole('radio', { name: 'Carbon dioxide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));

    expect(screen.getByRole('alert').textContent).toContain('Try again');
    expect(screen.queryByRole('button', { name: /Complete lesson five/i })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Oxygen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByRole('status').textContent).toContain('Correct');
    fireEvent.click(screen.getByRole('button', { name: /Complete lesson five/i }));

    expect(screen.getByRole('heading', { name: 'You are ready to teach it back' })).toBeTruthy();
    expect(screen.getByText('5 / 5')).toBeTruthy();
    expect(screen.getByLabelText('100% of Unit 1 complete')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open Feynman checkpoint/i })).toBeTruthy();
    const checkpoint = screen.getByText('Feynman checkpoint').closest('li');
    expect(within(checkpoint!).getByText('Ready')).toBeTruthy();
  });

  it('submits the predefined answer and shows all five evidence-backed criteria', () => {
    render(<LearningPathDemo />);
    completeLessonFive();
    fireEvent.click(screen.getByRole('button', { name: /Open Feynman checkpoint/i }));

    expect(screen.getByRole('heading', { name: 'Teach it back' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Your explanation' }) as HTMLTextAreaElement).value).toBe(predefinedAnswer);
    fireEvent.click(screen.getByRole('button', { name: /Submit explanation/i }));

    expect(screen.getByRole('heading', { name: 'Your teach-back report' })).toBeTruthy();
    expect(screen.getByText('2 strengths · 2 developing · 1 priority. Unit 2 is open.')).toBeTruthy();
    expect(screen.getByText('2 of 3 links explained. Review the missing connection next.')).toBeTruthy();

    for (const criterion of rubric) {
      const row = screen.getByRole('heading', { name: criterion.name }).closest('article');
      expect(row).not.toBeNull();
      expect(within(row!).getByText(criterion.evidence)).toBeTruthy();
      expect(within(row!).getByText(criterion.nextStep)).toBeTruthy();
    }
  });

  it('opens the targeted review, returns to the report, continues to Unit 2, and restarts', () => {
    render(<LearningPathDemo />);
    openReport();

    fireEvent.click(screen.getByRole('button', { name: /Review lesson 3/i }));
    expect(screen.getByRole('heading', { name: 'What changes when carbon dioxide runs low?' })).toBeTruthy();
    expect(screen.getByText('Less CO₂')).toBeTruthy();
    expect(screen.getByText('Less sugar')).toBeTruthy();
    expect(screen.getByText('Slower growth')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Return to report/i }));
    expect(screen.getByRole('heading', { name: 'Your teach-back report' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Continue when ready/i }));

    expect(screen.getByRole('heading', { name: 'Unit 2 is unlocked' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What limits photosynthesis?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Restart demo/i }));
    expect(screen.getByRole('heading', { name: 'Build understanding one step at a time' })).toBeTruthy();
    expect(screen.getByText('4 / 5')).toBeTruthy();
  });
});
