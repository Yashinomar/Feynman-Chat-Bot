import { ApiError } from '@/lib/security';
import { vectorSchema } from '@/lib/ai';

export const MAX_DOCUMENT_CHARACTERS = 60000;
export const MAX_NOTE_CHUNKS = 60;
export const MAX_CHUNK_CHARACTERS = 1200;

export function chunkDocument(documentText: string): string[] {
  const text = documentText.replace(/\u0000/g, '').trim();
  if (text.length < 20) throw new ApiError(400, 'No readable notes were found. For scanned PDFs, run OCR first or upload a text file.');
  if (text.length > MAX_DOCUMENT_CHARACTERS) throw new ApiError(413, 'Notes must contain at most 60,000 characters. Upload a shorter section.');
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + MAX_CHUNK_CHARACTERS, text.length);
    if (end < text.length) {
      const breakAt = text.lastIndexOf(' ', end);
      if (breakAt > cursor + 600) end = breakAt;
    }
    const chunk = text.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    cursor = end;
    while (text[cursor] === ' ') cursor++;
  }
  if (chunks.length > MAX_NOTE_CHUNKS) throw new ApiError(413, 'The document has too many passages. Upload a shorter section.');
  return chunks;
}

type StoredPassage = { id: string; position: number; text: string; embedding: string };
export type NoteSource = Pick<StoredPassage, 'id' | 'position' | 'text'>;

export function rankPassages(query: number[], passages: StoredPassage[]): NoteSource[] {
  const queryResult = vectorSchema.safeParse(query);
  if (!queryResult.success || passages.length === 0 || passages.length > MAX_NOTE_CHUNKS) {
    throw new ApiError(503, 'These notes are unavailable. Please upload them again before continuing.');
  }
  const norm = Math.sqrt(query.reduce((sum, value) => sum + value * value, 0));
  try {
    return passages.map(passage => {
      const vector = vectorSchema.parse(JSON.parse(passage.embedding));
      if (vector.length !== query.length || passage.text.length > MAX_CHUNK_CHARACTERS) throw new Error('Invalid stored passage');
      const dot = query.reduce((sum, value, index) => sum + value * vector[index], 0);
      const otherNorm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
      return { id: passage.id, position: passage.position, text: passage.text, similarity: dot / (norm * otherNorm) };
    }).sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map(({ id, position, text }) => ({ id, position, text }));
  } catch {
    throw new ApiError(503, 'These notes could not be searched. Please upload them again before continuing.');
  }
}
