// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  createImportSessionService,
  ImportSessionError,
} from '../../src/main/services/import-sessions';
import {
  mergeProjectSegments,
  reorderProjectSegments,
  splitProjectSegment,
} from '../../src/main/services/import-classifier';
import type { ProjectSegmentPreview } from '../../src/shared/domain';
import { previewPositionFromText } from '../../src/main/services/position-import';
import { extractDocumentText } from '../../src/main/services/document-import';
import { createOcrService } from '../../src/main/services/ocr';
import JSZip from 'jszip';

function aiSegment(options: {
  tempId: string;
  name: string;
  sourceText: string;
  boundaries: { startLine: number; endLine: number };
  suggested?: Partial<ProjectSegmentPreview['suggested']>;
  fields?: Partial<ProjectSegmentPreview['fields']>;
}): ProjectSegmentPreview {
  const suggested: ProjectSegmentPreview['suggested'] = {
    name: options.name,
    projectTime: '',
    background: '',
    goal: '',
    role: '',
    keyDecisions: '',
    outcome: '',
    evidence: '',
    reflections: '',
    storytellingVersions: '',
    unclassifiedNotes: '',
    ...options.suggested,
  };
  const fieldKeys = Object.keys(suggested) as Array<keyof ProjectSegmentPreview['fields']>;
  const fields = Object.fromEntries(fieldKeys.map((key) => [key, {
    value: suggested[key],
    provenance: 'ai-suggestion',
    evidence: '',
  }])) as ProjectSegmentPreview['fields'];
  Object.assign(fields, options.fields);
  return {
    tempId: options.tempId,
    name: options.name,
    sourceText: options.sourceText,
    suggested,
    boundaries: options.boundaries,
    fields,
    missingFields: fieldKeys.filter((key) => key !== 'name' && !suggested[key]),
    unusedContent: [],
    warnings: [],
  };
}

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

function multiLineTextPdf(lines: string[]): Uint8Array {
  const lineOperations = lines.flatMap((line, index) => {
    const y = 720 - index * 24;
    return [
      `1 0 0 1 72 ${y} Tm`,
      `(${line}) Tj`,
      `1 0 0 1 260 ${y} Tm`,
      `(Details ${index + 1}) Tj`,
    ];
  }).join('\n');
  const stream = `BT /F1 12 Tf\n${lineOperations}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
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

  it('uses short title-area heuristics when screenshots omit field labels', () => {
    const preview = previewPositionFromText([
      'AI 产品经理｜远山科技有限公司｜杭州 Hybrid',
      '我们正在寻找熟悉大模型产品设计的伙伴。',
      '岗位职责包括需求研究、方案设计与跨团队推进。',
    ].join('\n'));

    expect(preview.suggested).toMatchObject({
      company: '远山科技有限公司',
      title: 'AI 产品经理',
      location: '杭州 Hybrid',
    });
    expect(preview.confidence.title).toBeGreaterThan(0.5);
  });

  it('merges AI segments without re-running local field heuristics', () => {
    const current = aiSegment({
      tempId: '11111111-1111-4111-8111-111111111111',
      name: '智能问答',
      sourceText: '# 智能问答\n原始背景',
      boundaries: { startLine: 2, endLine: 3 },
      suggested: { background: 'AI 背景', projectTime: '2024' },
      fields: {
        background: { value: 'AI 背景', provenance: 'ai-rewrite', evidence: 'L3: 原始背景' },
      },
    });
    const next = aiSegment({
      tempId: '22222222-2222-4222-8222-222222222222',
      name: '数据看板',
      sourceText: '# 数据看板\n结果：下降 20%',
      boundaries: { startLine: 4, endLine: 5 },
      suggested: { outcome: '下降 20%' },
      fields: {
        outcome: { value: '下降 20%', provenance: 'source', evidence: 'L5: 结果：下降 20%' },
      },
    });

    const merged = mergeProjectSegments([current, next], current.tempId);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      name: '智能问答',
      sourceText: '# 智能问答\n原始背景\n\n# 数据看板\n结果：下降 20%',
      boundaries: { startLine: 2, endLine: 5 },
      suggested: { background: 'AI 背景', projectTime: '2024' },
    });
    expect(merged[0]?.fields.background).toEqual(current.fields.background);
    expect(merged[0]?.suggested.outcome).toBe('');
  });

  it('splits by source text while preserving the first AI result and leaving the new segment blank', () => {
    const current = aiSegment({
      tempId: '33333333-3333-4333-8333-333333333333',
      name: '智能问答',
      sourceText: '# 智能问答\n背景：原始背景\n结果：原始结果',
      boundaries: { startLine: 10, endLine: 12 },
      suggested: { background: 'AI 背景', projectTime: '2024' },
      fields: {
        background: { value: 'AI 背景', provenance: 'ai-rewrite', evidence: 'L11: 背景：原始背景' },
      },
    });

    const split = splitProjectSegment([current], current.tempId, '结果：原始结果');

    expect(split).toHaveLength(2);
    expect(split[0]).toMatchObject({
      tempId: current.tempId,
      sourceText: '# 智能问答\n背景：原始背景',
      boundaries: { startLine: 10, endLine: 11 },
      suggested: { background: 'AI 背景', projectTime: '2024' },
    });
    expect(split[0]?.fields.background).toEqual(current.fields.background);
    expect(split[1]).toMatchObject({
      sourceText: '结果：原始结果',
      boundaries: { startLine: 12, endLine: 12 },
      name: '',
    });
    expect(Object.values(split[1]?.suggested ?? {}).every((value) => value === '')).toBe(true);
    expect(Object.values(split[1]?.fields ?? {}).every((field) => field.value === '')).toBe(true);
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

  it('preserves visual line boundaries while extracting a multi-project PDF', async () => {
    await expect(extractDocumentText({
      name: 'projects.pdf',
      type: 'application/pdf',
      bytes: multiLineTextPdf(['1. Project Alpha', '2. Project Beta', '3. Project Gamma']),
    })).resolves.toMatchObject({
      kind: 'pdf',
      text: '1. Project Alpha Details 1\n2. Project Beta Details 2\n3. Project Gamma Details 3',
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
