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
  it('previews exact selected data and creates pending proposals only after confirm', async () => {
    const db = createTestDatabase();
    try {
      const positions = createPositionsRepository(db);
      const prompts = createPromptsRepository(db);
      const proposals = createProposalsRepository(db);
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
      expect(result).toHaveLength(1);
      expect(proposals.list('pending')).toEqual([
        expect.objectContaining({
          targetType: 'capability',
          operation: 'create',
          positionId: first.id,
          payload: {
            name: '用户研究',
            jdFrequency: 2,
            evidence: 'JD-A 提及用户研究\nJD-B 提及用户研究',
            gaps: '需要补充量化案例',
            mergedIntoId: null,
          },
        }),
      ]);
      expect(assets.listCapabilities()).toEqual([]);
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
      expect(proposals.list()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
