import { GoogleGenAI, type Content } from '@google/genai';
import { z } from 'zod';
import { ApiError } from '@/lib/security';

export const textSchema = z.string().trim().min(1).max(6000);
export const topicSchema = z.string().trim().min(1).max(200);
export const levelSchema = z.enum(['kid', 'highschool', 'professional']);
export const behaviorSchema = z.enum(['curious', 'skeptical', 'enthusiastic', 'distracted']);
export const messageSchema = z.object({ role: z.enum(['user', 'ai']), content: textSchema }).strict();
export const evaluationSchema = z.object({
  reply: textSchema,
  score: z.number().int().min(0).max(100),
  stepComplete: z.boolean(),
}).strict();
export const vectorSchema = z.array(z.number().finite()).min(1).max(3072)
  .refine(values => {
    const normSquared = values.reduce((sum, value) => sum + value * value, 0);
    return Number.isFinite(normSquared) && normSquared > 0;
  }, 'Embedding must have a finite, nonzero norm');

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError(503, 'The AI service is not configured. Ask your teacher or administrator for help.');
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: 30000 } });
}

export function parseModelJson<T>(text: string | undefined, schema: z.ZodType<T>): T {
  if (!text || text.length > 50000) throw new ApiError(502, 'The AI returned an invalid response. Nothing was saved; please try again.');
  const cleaned = text.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```$/, '').trim();
  try {
    return schema.parse(JSON.parse(cleaned));
  } catch {
    throw new ApiError(502, 'The AI returned an invalid response. Nothing was saved; please try again.');
  }
}

export async function generateJson<T>(instruction: string, messages: { role: string; content: string }[], schema: z.ZodType<T>, maxOutputTokens = 2048): Promise<T> {
  const model = client();
  const contents: Content[] = messages.map(message => ({
    role: message.role === 'ai' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  try {
    const response = await model.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: instruction,
        responseMimeType: 'application/json',
        maxOutputTokens,
        temperature: 0.4,
        abortSignal: AbortSignal.timeout(30000),
      },
    });
    return parseModelJson(response.text, schema);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'The AI service could not complete this request. Nothing was saved; please try again.');
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = client();
  try {
    const response = await model.models.embedContent({
      model: 'gemini-embedding-001',
      contents: texts,
      config: { outputDimensionality: 768 },
    });
    const vectors = response.embeddings?.map(embedding => vectorSchema.parse(embedding.values));
    if (!vectors || vectors.length !== texts.length || vectors.some(vector => vector.length !== vectors[0].length)) {
      throw new Error('Invalid embedding batch');
    }
    return vectors;
  } catch {
    throw new ApiError(502, 'Your notes could not be indexed or searched. Please try again; no partial study session was saved.');
  }
}
