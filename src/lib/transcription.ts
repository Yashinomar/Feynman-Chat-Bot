import { ApiError } from '@/lib/api';

type Transcriber = (audio: Float32Array, options: { chunk_length_s: number }) => Promise<unknown>;
let modelPromise: Promise<Transcriber> | undefined;
let active = false;

async function loadModel(): Promise<Transcriber> {
  if (!modelPromise) {
    const pending = (async () => {
      try {
        const { pipeline } = await import('@huggingface/transformers');
        const createPipeline = pipeline as unknown as (task: string, model: string) => Promise<Transcriber>;
        return createPipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      } catch {
        throw new ApiError(503, 'Speech recognition could not load. Please type your explanation or try again later.');
      }
    })();
    // Clear the shared load before rejecting callers so an immediate retry can start.
    modelPromise = pending.catch(error => { modelPromise = undefined; throw error; });
  }
  return modelPromise;
}

export async function transcribe(audio: Float32Array): Promise<string> {
  if (process.env.TRANSCRIPTION_ENABLED === 'false') {
    throw new ApiError(503, 'Speech recognition is not enabled on this server. Please type your explanation.');
  }
  if (active) throw new ApiError(429, 'Speech recognition is busy. Please try again shortly.');
  active = true;
  const work = (async () => {
    const model = await loadModel();
    const output = await model(audio, { chunk_length_s: 30 });
    if (!output || typeof output !== 'object' || !('text' in output) || typeof output.text !== 'string') {
      throw new ApiError(502, 'Speech recognition returned an invalid result. Please try again.');
    }
    const text = output.text.trim();
    if (!text) throw new ApiError(422, 'No speech was recognized. Try a clearer recording or type your explanation.');
    if (text.length > 10_000) throw new ApiError(422, 'The transcript is too long. Please record a shorter explanation.');
    return text;
  })();
  // A timed-out native call may still be running: do not open a second CPU job until it settles.
  void work.then(() => { active = false; }, () => { active = false; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { timedOut = true; reject(new ApiError(503, 'Speech recognition is taking too long. Please type your explanation and try audio later.')); }, 120_000);
    })]);
  } catch (error) {
    if (!timedOut) active = false;
    if (error instanceof ApiError) throw error;
    if (error && typeof error === 'object' && 'message' in error && error.message === 'Speech recognition could not load. Please type your explanation or try again later.') {
      throw new ApiError(503, error.message);
    }
    throw new ApiError(503, 'Speech recognition could not load or process audio. Please type your explanation or try again later.');
  } finally { if (timer) clearTimeout(timer); }
}
