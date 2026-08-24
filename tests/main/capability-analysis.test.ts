// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createPromptsRepository } from '../../src/main/repositories/prompts';
import { createProposalsRepository } from '../../src/main/repositories/proposals';
import { createCapabilityAnalysisService } from '../../src/main/services/capability-analysis';
import { createTestDatabase } from '../helpers/database';

const SETTINGS = {
  baseUrl: 'https://api.example.com/v1',
  model: 'analysis-model',
  apiKey: 'secret',
};

describe('explicit capability analysis', () => {
  it('previews exact selected data and stores only the structured analysis after confirm', async () => {
    const db = createTestDatabase();
    try {
      const positions = createPositionsRepository(db);
      const prompts = createPromptsRepository(db);
      const proposals = createProposalsRepository(db);
      const commitSpy = vi.spyOn(proposals, 'commitCapabilityAnalysis');
      const assets = createAssetsRepository(db);
      const first = positions.create({
        company: '甲公司',
        title: 'AI 产品经理',
        interest: 5,
        rawJd: 'JD-A：用户研究、产品策略',
      });
      const second = positions.create({
        company: '乙公司',
        title: 'AI 产品经理',
        interest: 4,
        rawJd: 'JD-B：用户研究、跨团队协作',
      });
      positions.create({
        company: '丙公司',
        title: '运营',
        interest: 2,
        rawJd: '不应发送的 JD',
      });
      const prompt = prompts.save('capability-analysis', '当前共性能力分析 Prompt');
      const completeJson = vi.fn().mockResolvedValue({
        capabilities: [{
          name: '用户研究',
          jdFrequency: 2,
          evidence: ['JD-A 提及用户研究', 'JD-B 提及用户研究'],
          gaps: ['需要补充量化案例'],
        }],
      });
      const service = createCapabilityAnalysisService({
        positions,
        prompts,
        proposals,
        ai: { completeJson },
        getSettings: async () => SETTINGS,
      });

      const preview = await service.preview([first.id, second.id]);
      expect(completeJson).not.toHaveBeenCalled();
      expect(preview.prompt).toBe(prompt.content);
      expect(preview.provider).toBe('https://api.example.com');
      expect(preview.model).toBe('analysis-model');
      expect(preview.positions.map(({ rawJd }) => rawJd)).toEqual([
        first.rawJd,
        second.rawJd,
      ]);
      expect(JSON.stringify(preview)).not.toContain('不应发送的 JD');

      const result = await service.confirm(preview.token);

      expect(completeJson).toHaveBeenCalledTimes(1);
      const request = completeJson.mock.calls[0]?.[0];
      expect(request.messages[0]).toEqual({
        role: 'system',
        content: prompt.content,
      });
      expect(request.messages[1].content).toContain(first.rawJd);
      expect(request.messages[1].content).toContain(second.rawJd);
      expect(request.messages[1].content).not.toContain('不应发送的 JD');
      expect(result).toEqual({
        capabilities: [{
          name: '用户研究',
          jdFrequency: 2,
          evidence: ['JD-A 提及用户研究', 'JD-B 提及用户研究'],
          gaps: ['需要补充量化案例'],
        }],
      });
      expect(commitSpy).toHaveBeenCalledWith(
        expect.anything(),
        [],
      );
      const run = db.prepare('SELECT * FROM capability_analysis_runs').get();
      expect(run).toMatchObject({
        selected_position_ids_json: JSON.stringify([first.id, second.id]),
        prompt_snapshot: prompt.content,
        provider_origin: 'https://api.example.com',
        model: 'analysis-model',
      });
      expect(JSON.parse(String(run?.input_json))).toMatchObject({
        messages: expect.any(Array),
      });
      expect(JSON.parse(String(run?.output_json))).toEqual({
        capabilities: [{
          name: '用户研究',
          jdFrequency: 2,
          evidence: ['JD-A 提及用户研究', 'JD-B 提及用户研究'],
          gaps: ['需要补充量化案例'],
        }],
      });
      expect(JSON.stringify(run)).not.toContain(SETTINGS.apiKey);
      expect(proposals.list('pending').items).toEqual([]);
      expect(db.prepare('SELECT COUNT(*) AS count FROM change_proposals').get())
        .toEqual({ count: 0 });
      expect(assets.listCapabilities()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('stores multiple structured capabilities without creating proposals', async () => {
    const db = createTestDatabase();
    try {
      const positions = createPositionsRepository(db);
      const first = positions.create({
        company: '甲公司',
        title: '产品经理',
        interest: 5,
        rawJd: 'JD-A',
      });
      const second = positions.create({
        company: '乙公司',
        title: '产品经理',
        interest: 4,
        rawJd: 'JD-B',
      });
      const proposals = createProposalsRepository(db);
      const service = createCapabilityAnalysisService({
        positions,
        prompts: createPromptsRepository(db),
        proposals,
        ai: {
          completeJson: vi.fn().mockResolvedValue({
            capabilities: [
              { name: '策略', jdFrequency: 2, evidence: ['A'], gaps: [] },
              { name: '沟通', jdFrequency: 2, evidence: ['B'], gaps: [] },
            ],
          }),
        },
        getSettings: async () => SETTINGS,
      });
      const preview = await service.preview([first.id, second.id]);
      await expect(service.confirm(preview.token)).resolves.toEqual({
        capabilities: [
          { name: '策略', jdFrequency: 2, evidence: ['A'], gaps: [] },
          { name: '沟通', jdFrequency: 2, evidence: ['B'], gaps: [] },
        ],
      });
      expect(db.prepare('SELECT COUNT(*) AS count FROM capability_analysis_runs').get())
        .toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM change_proposals').get())
        .toEqual({ count: 0 });
      expect(createAssetsRepository(db).listCapabilities()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('rejects invalid or duplicate output without writing proposals', async () => {
    const db = createTestDatabase();
    try {
      const positions = createPositionsRepository(db);
      const proposals = createProposalsRepository(db);
      const first = positions.create({
        company: '甲公司',
        title: '产品经理',
        interest: 5,
        rawJd: 'JD-A',
      });
      const second = positions.create({
        company: '乙公司',
        title: '产品经理',
        interest: 4,
        rawJd: 'JD-B',
      });
      const service = createCapabilityAnalysisService({
        positions,
        prompts: createPromptsRepository(db),
        proposals,
        ai: {
          completeJson: vi.fn().mockResolvedValue({
            capabilities: [
              { name: '策略', jdFrequency: 3, evidence: [], gaps: [] },
            ],
          }),
        },
        getSettings: async () => SETTINGS,
      });
      const preview = await service.preview([first.id, second.id]);

      await expect(service.confirm(preview.token)).rejects.toMatchObject({
        code: 'AI_INVALID_OUTPUT',
      });
      expect(proposals.list().items).toEqual([]);
    } finally {
      db.close();
    }
  });
});
