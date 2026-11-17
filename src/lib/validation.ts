import { z } from 'zod';
export const topicSchema = z.string().trim().min(1).max(200);
export const credentialsSchema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,32}$/, 'Use 3–32 letters, numbers, or underscores.').transform(s => s.toLowerCase()),
  password: z.string().min(12).refine(s => Buffer.byteLength(s, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.'),
});
export const personaShape = {
  studentLevel: z.enum(['kid', 'highschool', 'professional']).default('highschool'),
  studentBehavior: z.enum(['curious', 'skeptical', 'enthusiastic', 'distracted']).default('curious'),
};
export const createSessionSchema = z.object({ topic: topicSchema, ...personaShape }).strict();
export const updateSessionSchema = z.object({
  topic: topicSchema.optional(),
  status: z.enum(['active', 'checkpoint', 'completed']).optional(),
  activeCorrection: z.literal(null).optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
}).strict()
  .refine(s => Object.keys(s).length > 0, 'Provide a field to update.')
  .refine(s => s.activeCorrection === null
    ? s.expectedVersion !== undefined && s.topic === undefined && s.status === undefined
    : s.expectedVersion === undefined,
  'Dismiss a correction in a separate request with its session version.');
