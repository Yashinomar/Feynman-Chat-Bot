// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CourseManager from '@/components/CourseManager';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('keeps authored lessons and sublessons after a failed save', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => init?.method === 'PUT' ? Response.json({ error: 'Save unavailable.' }, { status: 503 }) : Response.json([])));
  render(<CourseManager />);
  await screen.findByText('No courses yet. Create your first course.');
  fireEvent.click(screen.getByRole('button', { name: 'New course' }));
  fireEvent.change(screen.getByLabelText('Course title'), { target: { value: 'Biology course' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add lesson' }));
  fireEvent.change(screen.getByLabelText('Lesson content'), { target: { value: 'Light helps plants make sugar.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add sublesson' }));
  fireEvent.change(screen.getByLabelText('Sublesson content'), { target: { value: 'Chlorophyll absorbs light.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Your edits are still in the editor');
  expect((screen.getByLabelText('Course title') as HTMLInputElement).value).toBe('Biology course');
  expect((screen.getByLabelText('Sublesson content') as HTMLTextAreaElement).value).toBe('Chlorophyll absorbs light.');
});
it('blocks publishing an empty course with an actionable message', async () => {
  const fetcher = vi.fn(async () => Response.json([])); vi.stubGlobal('fetch', fetcher);
  render(<CourseManager />); await screen.findByText('No courses yet. Create your first course.');
  fireEvent.click(screen.getByRole('button', { name: 'New course' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish this version' }));
  expect(screen.getByRole('alert').textContent).toContain('Add at least one lesson');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
