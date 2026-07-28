// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  createImportSessionService,
  ImportSessionError,
} from '../../src/main/services/import-sessions';
import {
  classifyProjectText,
  mergeProjectSegments,
  reorderProjectSegments,
  splitProjectSegment,
} from '../../src/main/services/import-classifier';
import { previewPositionFromText } from '../../src/main/services/position-import';
import { extractDocumentText } from '../../src/main/services/document-import';
import { createOcrService } from '../../src/main/services/ocr';
import JSZip from 'jszip';

function textPdf(text: string): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length + 34} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

describe('local import services', () => {
  it('keeps preview data only until it is consumed or cancelled', () => {
    const sessions = createImportSessionService({ ttlMs: 60_000 });
    const id = sessions.create('position', { source: 'temporary' });

    expect(sessions.get(id, 'position')).toEqual({ source: 'temporary' });
    expect(sessions.consume(id, 'position')).toEqual({ source: 'temporary' });
    expect(() => sessions.get(id, 'position')).toThrow(ImportSessionError);

    const cancelled = sessions.create('project', { source: 'discard me' });
    sessions.cancel(cancelled);
    expect(() => sessions.get(cancelled, 'project')).toThrow(ImportSessionError);
  });

  it('expires a preview without retaining its payload', () => {
    vi.useFakeTimers();
    try {
      const sessions = createImportSessionService({ ttlMs: 500 });
      const id = sessions.create('position', { raw: new Uint8Array([1, 2, 3]) });
      vi.advanceTimersByTime(501);
      expect(() => sessions.get(id, 'position')).toThrow(ImportSessionError);
      expect(sessions.size()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('classifies a pasted JD into editable position fields', () => {
    const preview = previewPositionFromText([
      '公司：远山科技',
      '岗位：AI 产品经理',
      '地点：上海 / 混合办公',
      '',
      '岗位职责',
      '负责 AI 产品规划、用户研究和跨团队协作。',
    ].join('\n'));

    expect(preview.suggested).toMatchObject({
      company: '远山科技',
      title: 'AI 产品经理',
      location: '上海 / 混合办公',
      interest: 3,
    });
    expect(preview.suggested.rawJd).toContain('岗位职责');
    expect(preview.confidence.company).toBeGreaterThanOrEqual(0.8);
  });

  it('segments project notes and supports the review operations', () => {
    const segments = classifyProjectText([
      '# 项目一：智能问答',
      '背景：客服响应慢',
      '目标：缩短响应时间',
      '我的角色：产品负责人',
      '结果：平均响应时间降低 40%',
      '',
      '# 项目二：数据看板',
      '负责指标体系和上线推进',
    ].join('\n'));

    expect(segments).toHaveLength(2);
    expect(segments[0]?.suggested).toMatchObject({
      name: '项目一：智能问答',
      background: '客服响应慢',
      goal: '缩短响应时间',
      role: '产品负责人',
      outcome: '平均响应时间降低 40%',
    });
    expect(segments[1]?.suggested.unclassifiedNotes).toContain('负责指标体系');

    const merged = mergeProjectSegments(segments, segments[0]!.tempId);
    expect(merged).toHaveLength(1);
    const split = splitProjectSegment(merged, merged[0]!.tempId, '负责指标体系');
    expect(split).toHaveLength(2);
    expect(reorderProjectSegments(split, split.map((item) => item.tempId).reverse())[0]?.tempId)
      .toBe(split[1]?.tempId);
  });

  it('extracts only plain text from TXT, Markdown and DOCX documents', async () => {
    await expect(extractDocumentText({
      name: 'notes.txt',
      type: 'text/plain',
      bytes: new TextEncoder().encode('项目：客服助手'),
    })).resolves.toMatchObject({ text: '项目：客服助手', kind: 'txt' });
    await expect(extractDocumentText({
      name: 'notes.md',
      type: 'text/markdown',
      bytes: new TextEncoder().encode('# 项目：知识库'),
    })).resolves.toMatchObject({ text: '# 项目：知识库', kind: 'md' });

    const zip = new JSZip();
    zip.file('[Content_Types].xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      '</Types>',
    ].join(''));
    zip.folder('_rels')!.file('.rels', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
      '</Relationships>',
    ].join(''));
    zip.folder('word')!.file('document.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:body><w:p><w:r><w:t>项目：离线知识库</w:t></w:r></w:p></w:body></w:document>',
    ].join(''));
    const docx = await zip.generateAsync({ type: 'uint8array' });
    const extracted = await extractDocumentText({
      name: 'project.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: docx,
    });
    expect(extracted.kind).toBe('docx');
    expect(extracted.text).toContain('项目：离线知识库');
    expect(extracted.text).not.toContain('<w:');

    await expect(extractDocumentText({
      name: 'project.pdf',
      type: 'application/pdf',
      bytes: textPdf('Project Alpha'),
    })).resolves.toMatchObject({
      kind: 'pdf',
      text: expect.stringContaining('Project Alpha'),
      pageCount: 1,
    });
  });

  it('keeps ordered image OCR text and reports progress through an injected worker', async () => {
    const recognize = vi.fn(async (bytes: Uint8Array) => ({
      text: bytes[0] === 1 ? '公司：远山科技' : '岗位：AI 产品经理\n地点：上海\n岗位职责：产品规划',
      confidence: 88,
    }));
    const progress: number[] = [];
    const ocr = createOcrService({ recognize });
    const result = await ocr.preview([
      { name: '1.png', type: 'image/png', bytes: new Uint8Array([1]), width: 100, height: 100 },
      { name: '2.png', type: 'image/png', bytes: new Uint8Array([2]), width: 100, height: 100 },
    ], { onProgress: (value) => progress.push(value) });

    expect(recognize).toHaveBeenCalledTimes(2);
    expect(result.text.indexOf('公司')).toBeLessThan(result.text.indexOf('岗位'));
    expect(progress.at(-1)).toBe(100);
    await ocr.dispose();
  });
});
