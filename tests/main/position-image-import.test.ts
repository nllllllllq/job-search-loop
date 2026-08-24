// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  createPositionImageImportService,
  type PositionImageImportServiceDependencies,
} from '../../src/main/services/position-image-import';

const images = [
  {
    name: 'first.png',
    type: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
    width: 900,
    height: 1400,
  },
  {
    name: 'second.jpg',
    type: 'image/jpeg',
    bytes: new Uint8Array([4, 5, 6]),
    width: 900,
    height: 1400,
  },
];

describe('position image import service', () => {
  it('rejects unsafe image input before requesting AI completion', async () => {
    const completeJson = vi.fn<PositionImageImportServiceDependencies['ai']['completeJson']>();
    const getSettings = vi.fn<PositionImageImportServiceDependencies['getSettings']>();
    const service = createPositionImageImportService({
      ai: { completeJson },
      getSettings,
      prompts: { get: vi.fn() },
    });

    await expect(service.preview([{
      ...images[0]!,
      type: 'image/gif',
    }])).rejects.toThrow('Only PNG and JPEG images are supported.');
    await expect(service.preview([{
      ...images[0]!,
      bytes: new Uint8Array(12 * 1024 * 1024 + 1),
    }])).rejects.toThrow('Each image must be 12 MB or smaller.');
    await expect(service.preview([
      { ...images[0]!, width: 8_000, height: 5_001 },
    ])).rejects.toThrow('Combined image resolution must not exceed 40 MP.');

    expect(getSettings).not.toHaveBeenCalled();
    expect(completeJson).not.toHaveBeenCalled();
  });

  it('sends screenshots to the configured AI in selection order and returns a strict preview', async () => {
    const aiOutput = {
      company: '远山科技',
      title: 'AI 产品经理',
      location: '上海',
      rawJd: '负责 AI 产品规划与用户研究。',
      confidence: { company: 0.98, title: 0.96, location: 0.91, rawJd: 0.94 },
      warnings: ['第二张截图底部文字不完整'],
    };
    const completeJson = vi.fn<PositionImageImportServiceDependencies['ai']['completeJson']>(
      async () => aiOutput,
    );
    const getSettings = vi.fn(async () => ({
      baseUrl: 'https://api.example.com/v1',
      model: 'vision-model',
      apiKey: 'secret',
      capabilities: { images: true, fileInputProtocol: 'none' as const },
    }));
    const prompts = { get: vi.fn(() => ({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'position-image' as const,
      name: '岗位截图识别',
      content: '从招聘截图中提取岗位信息。',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    })) };
    const service = createPositionImageImportService({
      ai: { completeJson },
      getSettings,
      prompts,
    });

    await expect(service.preview(images)).resolves.toEqual(aiOutput);
    expect(prompts.get).toHaveBeenCalledWith('position-image');
    expect(getSettings).toHaveBeenCalledOnce();
    const [request, schema, settings] = completeJson.mock.calls[0]!;
    expect(request.messages[0]).toEqual({
      role: 'system',
      content: '从招聘截图中提取岗位信息。',
    });
    expect(request.messages[1]?.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text' }),
      { type: 'image', mimeType: 'image/png', bytes: images[0]!.bytes },
      { type: 'image', mimeType: 'image/jpeg', bytes: images[1]!.bytes },
    ]));
    expect(schema.safeParse(aiOutput).success).toBe(true);
    expect(settings).toEqual(await getSettings());
  });

  it('does not convert images to OCR when configured AI image input is unsupported', async () => {
    const completeJson = vi.fn<PositionImageImportServiceDependencies['ai']['completeJson']>(async () => {
      throw Object.assign(new Error('unsupported'), { code: 'AI_INPUT_UNSUPPORTED' });
    });
    const service = createPositionImageImportService({
      ai: { completeJson },
      getSettings: async () => ({
        baseUrl: 'https://api.example.com/v1', model: 'text-model', apiKey: 'secret',
      }),
      prompts: { get: () => ({
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'position-image',
        name: '截图识别',
        content: 'extract',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }) },
    });

    await expect(service.preview(images)).rejects.toMatchObject({ code: 'AI_INPUT_UNSUPPORTED' });
    expect(completeJson).toHaveBeenCalledOnce();
  });

  it('keeps partial AI recognition results so the user can fill missing required fields', async () => {
    const partial = {
      company: '',
      title: 'AI 产品经理',
      location: '',
      rawJd: '',
      confidence: { company: 0, title: 0.9, location: 0, rawJd: 0 },
      warnings: ['公司名称和完整 JD 未识别'],
    };
    const service = createPositionImageImportService({
      ai: { completeJson: async () => partial },
      getSettings: async () => ({
        baseUrl: 'https://api.example.com/v1', model: 'vision-model', apiKey: 'secret',
      }),
      prompts: { get: () => ({
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'position-image',
        name: '截图识别',
        content: 'extract',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }) },
    });

    await expect(service.preview(images)).resolves.toEqual(partial);
  });
});
