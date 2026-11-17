export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_CHARS = 60_000;
export const MAX_PDF_PAGES = 50;

export function validateDocumentText(text: string): string {
  const cleaned = text.replace(/\u0000/g, '').trim();
  if (cleaned.length < 10) throw new Error('No readable text was found. Scanned PDFs need OCR first; try a text PDF or a .txt file.');
  if (cleaned.length > MAX_DOCUMENT_CHARS) throw new Error('These notes are too long. Upload a shorter section (up to 60,000 characters).');
  return cleaned;
}

export async function extractDocumentText(file: File): Promise<string> {
  if (file.size === 0) throw new Error('This file is empty. Please choose notes containing text.');
  if (file.size > MAX_FILE_BYTES) throw new Error('This file is too large. Choose a file under 5 MB.');
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension !== 'pdf' && extension !== 'txt') throw new Error('Choose a PDF or plain text (.txt) file.');
  if (extension === 'txt') return validateDocumentText(await file.text());
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error('This PDF has too many pages. Upload a section of 50 pages or fewer.');
    let text = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        text += content.items.map(item => 'str' in item ? item.str : '').join(' ') + '\n';
        if (text.length > MAX_DOCUMENT_CHARS) throw new Error('These notes are too long. Upload a shorter section (up to 60,000 characters).');
      } finally { page.cleanup(); }
    }
    return validateDocumentText(text);
  } catch (error) {
    if (error instanceof Error && /too many pages|too long|No readable text/.test(error.message)) throw error;
    throw new Error('This PDF could not be read. It may be damaged or password protected. Try an unlocked text PDF or a .txt file.');
  } finally { await task.destroy(); }
}
