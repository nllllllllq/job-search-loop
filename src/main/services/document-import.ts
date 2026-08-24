import { extname } from 'node:path';
import mammoth from 'mammoth';
import type { ImportedFileInput } from '../../shared/domain';

export type ExtractedDocument = {
  kind: 'docx' | 'pdf' | 'txt' | 'md';
  text: string;
  pageCount?: number;
  warnings: string[];
};

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const importEsm = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>;
const PDF_LINE_Y_TOLERANCE = 2;

function extension(name: string): ExtractedDocument['kind'] {
  const ext = extname(name).toLowerCase();
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.txt') return 'txt';
  if (ext === '.md' || ext === '.markdown') return 'md';
  throw new Error('仅支持 DOCX、PDF、TXT 和 MD 文件');
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '').trim();
}

function mammothHtmlToPlainText(html: string): string {
  return html
    .replace(/<h([1-6])[^>]*>/gi, (_match, level: string) => `${'#'.repeat(Number(level))} `)
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<(?:br|\/p|\/li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedDocument> {
  // TypeScript's CommonJS transform rewrites import() to require(), which
  // cannot load PDF.js' ESM-only entry. Production keeps a native import
  // boundary; Vitest supplies its own ESM loader and cannot attach one to
  // Function(), so it uses the source-level import.
  const pdfjs = process.env.VITEST
    ? await import('pdfjs-dist/legacy/build/pdf.mjs')
    : await importEsm('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: Uint8Array.from(bytes),
  });
  const document = await task.promise;
  try {
    if (document.numPages > 100) throw new Error('PDF 最多支持 100 页');
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line: string[] = [];
      let lineY: number | undefined;
      const flushLine = () => {
        if (line.length > 0) lines.push(line.join(' '));
        line = [];
        lineY = undefined;
      };
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const text = item.str.trim();
        const y = Number(item.transform?.[5]);
        const yChanged = lineY !== undefined
          && Number.isFinite(y)
          && Math.abs(y - lineY) > PDF_LINE_Y_TOLERANCE;
        if (yChanged) flushLine();
        if (text) {
          line.push(text);
          if (lineY === undefined && Number.isFinite(y)) lineY = y;
        }
        if (item.hasEOL) flushLine();
      }
      flushLine();
      pages.push(lines.join('\n').trim());
      page.cleanup();
    }
    const text = pages.join('\n\n').trim();
    return {
      kind: 'pdf',
      text,
      pageCount: document.numPages,
      warnings: text
        ? []
        : ['PDF 没有可提取文字；当前版本请改用截图导入，扫描 PDF 页面 OCR 将在稳定性阶段补齐'],
    };
  } finally {
    await task.destroy();
  }
}

export async function extractDocumentText(file: ImportedFileInput): Promise<ExtractedDocument> {
  if (file.bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('文件不能超过 25 MB');
  if (file.bytes.byteLength === 0) throw new Error('文件内容为空');
  const kind = extension(file.name);
  if (
    kind === 'pdf'
    && new TextDecoder('ascii').decode(file.bytes.slice(0, 5)) !== '%PDF-'
  ) throw new Error('文件内容不是有效 PDF');
  if (
    kind === 'docx'
    && !(file.bytes[0] === 0x50 && file.bytes[1] === 0x4b)
  ) throw new Error('文件内容不是有效 DOCX');
  if (kind === 'txt' || kind === 'md') {
    return { kind, text: decodeUtf8(file.bytes), warnings: [] };
  }
  if (kind === 'docx') {
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(file.bytes) });
    return {
      kind,
      // Mammoth HTML is consumed only in the main process and reduced to plain
      // text plus heading markers. It is never exposed or injected in renderer.
      text: mammothHtmlToPlainText(result.value),
      warnings: result.messages.map((message) => message.message).slice(0, 10),
    };
  }
  return extractPdf(file.bytes);
}
