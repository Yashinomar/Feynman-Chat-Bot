// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractDocumentText, MAX_FILE_BYTES, validateDocumentText } from '../src/lib/document-client';

const pdf = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('pdfjs-dist', () => ({ ...pdf, GlobalWorkerOptions: {} }));
afterEach(() => vi.resetAllMocks());
function documentFile(name: string, size: number, text = ''): File {
  return { name, size, arrayBuffer: async () => new ArrayBuffer(10), text: async () => text } as File;
}

describe('notes ingestion feedback', () => {
  it('rejects empty, oversized, unsupported, and unreadable documents before indexing', async () => {
    await expect(extractDocumentText(documentFile('empty.txt', 0))).rejects.toThrow('empty');
    await expect(extractDocumentText(documentFile('large.pdf', MAX_FILE_BYTES + 1))).rejects.toThrow('too large');
    await expect(extractDocumentText(documentFile('notes.exe', 100))).rejects.toThrow('PDF or plain text');
    expect(() => validateDocumentText(' \n ')).toThrow('OCR');
    expect(() => validateDocumentText('a'.repeat(60001))).toThrow('too long');
    expect(pdf.getDocument).not.toHaveBeenCalled();
  });
  it('extracts a text PDF, cleans pages, and releases its worker', async () => {
    const cleanup = vi.fn();
    const destroy = vi.fn();
    pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: 'Mitochondria release energy.' }] }), cleanup }) }), destroy });
    expect(await extractDocumentText(documentFile('notes.pdf', 20))).toBe('Mitochondria release energy.');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it('explains scanned PDF failure and cleans up the worker', async () => {
    const destroy = vi.fn();
    pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [] }), cleanup: vi.fn() }) }), destroy });
    await expect(extractDocumentText(documentFile('scan.pdf', 20))).rejects.toThrow('Scanned PDFs need OCR');
    expect(destroy).toHaveBeenCalled();
  });
  it('explains malformed PDF failure without leaking library errors', async () => {
    const destroy = vi.fn();
    pdf.getDocument.mockReturnValue({ promise: Promise.reject(new Error('internal details')), destroy });
    await expect(extractDocumentText(documentFile('bad.pdf', 20))).rejects.toThrow('damaged or password protected');
    expect(destroy).toHaveBeenCalled();
  });
  it('stops before extracting an excessive page count', async () => {
    const destroy = vi.fn();
    const getPage = vi.fn();
    pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 51, getPage }), destroy });
    await expect(extractDocumentText(documentFile('large.pdf', 20))).rejects.toThrow('50 pages');
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });
});
