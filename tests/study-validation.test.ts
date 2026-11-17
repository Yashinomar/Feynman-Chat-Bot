import { describe, expect, it } from 'vitest';
import { evaluationSchema, parseModelJson } from '@/lib/ai';
import { chunkDocument, rankPassages } from '@/lib/rag';
import { calculateNextReview } from '@/lib/study';

describe('study output validation', () => {
  it('rejects invalid mastery and malformed AI replies instead of persisting them', () => {
    for (const text of ['{', '', '{"reply":"hi","score":101}', '{"reply":"hi","score":-1}', '{"reply":null,"score":50}', '{"reply":"hi","score":"50"}']) {
      expect(() => parseModelJson(text, evaluationSchema)).toThrow();
    }
    expect(parseModelJson('```json\n{"reply":"Explain the next step","score":80,"stepComplete":false}\n```', evaluationSchema)).toEqual({ reply: 'Explain the next step', score: 80, stepComplete: false });
  });

  it('hard-bounds chunks even when notes have no sentence breaks', () => {
    const chunks = chunkDocument('a'.repeat(60000));
    expect(chunks.length).toBeLessThanOrEqual(60);
    expect(chunks.every(chunk => chunk.length <= 1200)).toBe(true);
    expect(chunks.join('')).toBe('a'.repeat(60000));
    expect(() => chunkDocument('   ')).toThrow();
  });

  it('ranks the relevant passage and rejects invalid stored vectors', () => {
    const passages = [
      { id: 'other', position: 0, text: 'Volcanoes erupt.', embedding: '[0,1]' },
      { id: 'relevant', position: 1, text: 'Mitochondria produce ATP.', embedding: '[1,0]' },
    ];
    expect(rankPassages([1,0], passages)[0].id).toBe('relevant');
    expect(() => rankPassages([1,0], [{ ...passages[0], embedding: '[1]' }])).toThrow();
    expect(() => rankPassages([1,0], [{ ...passages[0], embedding: '[0,0]' }])).toThrow();
  });

  it('returns a real Date and advances only the validated review schedule', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const first = calculateNextReview(80, null, null, null, now);
    expect(first.reviewDate).toEqual(new Date('2026-01-02T00:00:00Z'));
    expect(first.repetition).toBe(1);
    const second = calculateNextReview(90, first.repetition, first.efactor, first.interval, now);
    expect(second.interval).toBe(6);
    expect(second.reviewDate.toISOString()).toBe('2026-01-07T00:00:00.000Z');
    expect(() => calculateNextReview(150)).toThrow();
  });
});
