import { z } from 'zod';

export const messageSchema = z.object({ id: z.string(), role: z.enum(['ai', 'user']), content: z.string() });
export const studySessionSchema = z.object({
  id: z.string(), topic: z.string(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  messages: z.array(messageSchema), status: z.enum(['active', 'checkpoint', 'completed']),
  masteryScore: z.number().int().min(0).max(100), version: z.number().int().nonnegative(),
  reviewDate: z.string().datetime().nullable().optional(), interval: z.number().nullable().optional(),
  repetition: z.number().nullable().optional(), efactor: z.number().nullable().optional(),
  activeCorrection: z.string().nullable().optional(), isRagSession: z.boolean().optional(),
  studentLevel: z.string().nullable().optional(), studentBehavior: z.string().nullable().optional(),
  learningPath: z.string().nullable().optional(), pathIndex: z.number().int().nonnegative().optional(),
  checkpointReport: z.string().nullable().optional(),
  courseCheckpointKey: z.string().nullable().optional(),
  courseContext: z.string().nullable().optional(),
});
export type StudySession = z.infer<typeof studySessionSchema>;
export const studySessionsSchema = z.array(studySessionSchema);
export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof Error ? error.message : fallback;
}
export async function requestJson<T>(url: string, schema: z.ZodType<T>, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, options); }
  catch { throw new RequestError('Connection lost. Please retry; your saved work is safe.', 0); }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = z.object({ error: z.string() }).safeParse(data);
    throw new RequestError(detail.success ? detail.data.error : 'The request failed. Please try again.', response.status);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new RequestError('The server returned an unexpected response. Please reload and try again.', 502);
  return parsed.data;
}
export function jsonBody(data: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}
export const successSchema = z.object({ success: z.boolean() });
