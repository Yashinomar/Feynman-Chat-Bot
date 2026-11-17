import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const loader = vi.hoisted(() => vi.fn());
vi.mock('@huggingface/transformers', () => ({ pipeline: loader }));
vi.mock('@/lib/api', () => ({ ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } } }));
const input = new Float32Array(4_000);
beforeEach(() => { vi.resetModules(); loader.mockReset(); delete process.env.TRANSCRIPTION_ENABLED; });
afterEach(() => { vi.useRealTimers(); });

describe('speech model failure and capacity handling', () => {
  it('loads once and returns bounded text without logging audio or transcript', async () => {
    const model = vi.fn(async () => ({ text: '  A sample explanation.  ' }));
    loader.mockResolvedValue(model);
    const { transcribe } = await import('@/lib/transcription');
    expect(await transcribe(input)).toBe('A sample explanation.');
    expect(await transcribe(input)).toBe('A sample explanation.');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(model).toHaveBeenCalledWith(input, { chunk_length_s: 30 });
  });
  it('returns a clear unavailable error on model load failure then allows a retry', async () => {
    loader.mockRejectedValueOnce(new Error('private native implementation details'));
    const { transcribe } = await import('@/lib/transcription');
    await expect(transcribe(input)).rejects.toMatchObject({ status: 503, message: expect.stringContaining('could not load') });
    loader.mockResolvedValue(async () => ({ text: 'Recovered' }));
    expect(await transcribe(input)).toBe('Recovered');
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it('bounds concurrent work even after a timed-out request', async () => {
    vi.useFakeTimers();
    let finish!: (value: { text: string }) => void;
    const model = vi.fn(() => new Promise<{ text: string }>(resolve => { finish = resolve; }));
    loader.mockResolvedValue(model);
    const { transcribe } = await import('@/lib/transcription');
    const first = transcribe(input);
    const timeout = expect(first).rejects.toMatchObject({ status: 503 });
    await expect(transcribe(input)).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(120_000);
    await timeout;
    await expect(transcribe(input)).rejects.toMatchObject({ status: 429 });
    finish({ text: 'Late completion' });
    await vi.advanceTimersByTimeAsync(0);
    model.mockResolvedValue({ text: 'Next recording' });
    expect(await transcribe(input)).toBe('Next recording');
  });
  it.each([{ output: {}, status: 502 }, { output: { text: '' }, status: 422 }, { output: { text: 'x'.repeat(10_001) }, status: 422 }])('rejects invalid model output', async ({ output, status }) => {
    loader.mockResolvedValue(async () => output);
    const { transcribe } = await import('@/lib/transcription');
    await expect(transcribe(input)).rejects.toMatchObject({ status });
  });
  it('can be disabled explicitly without loading a native model', async () => {
    process.env.TRANSCRIPTION_ENABLED = 'false';
    const { transcribe } = await import('@/lib/transcription');
    await expect(transcribe(input)).rejects.toMatchObject({ status: 503 });
    expect(loader).not.toHaveBeenCalled();
  });
});
