import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, readJson, requireUser, consumeRateLimit } from '@/lib/api';
import { transcribe } from '@/lib/transcription';

export const runtime = 'nodejs';
const audioSchema = z.object({
  sampleRate: z.literal(16_000),
  audio: z.array(z.number().finite().min(-1).max(1)).min(4_000).max(960_000),
}).strict();

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, 'transcribe', 2);
    await consumeRateLimit(`transcribe-hour:${user.id}`, 10, 60 * 60_000);
    const body = audioSchema.parse(await readJson(req, 24 * 1024 * 1024));
    return NextResponse.json({ text: await transcribe(new Float32Array(body.audio)) });
  } catch (error) { return apiError(error); }
}
