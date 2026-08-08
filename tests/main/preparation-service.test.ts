// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createPreparationsRepository } from '../../src/main/repositories/preparations';
import { createPromptsRepository } from '../../src/main/repositories/prompts';
import {
  createPreparationService,
  type PreparationServiceDependencies,
} from '../../src/main/services/preparation';
import { AiServiceError } from '../../src/main/services/ai-settings';
import { createTestDatabase } from '../helpers/database';

const output = {
  companyAndProductResearch: {
    businessAndUsers: '面向企业用户提供 AI 产品。',
    coreProducts: ['企业智能助手'],
    businessModel: '企业订阅，具体定价待核实。',
    recentDirection: '正在加强智能体能力，细节待核实。',
    roleProductHypothesis: '岗位可能负责企业智能助手，需面试核实。',
    verificationNotes: ['核实具体产品线'],
  },
  competencyMap: [1, 2, 3, 4, 5].map((rank) => ({
    rank: rank as 1 | 2 | 3 | 4 | 5,
    name: `能力${rank}`,
    jdEvidence: 'JD 明确强调。',
    roleUsage: '用于岗位日常工作。',
    proofSuggestion: '准备可核验的相关案例。',
  })),
  companyMap: {
    stage: 'Realignment' as const,
    summary: '公司正在校准 AI 产品方向。',
    priorities: ['验证高价值场景'],
    culture: ['快速实验'],
  },
  dreamCandidateAvatar: {
    typicalDay: [{ time: '09:00', activity: '分析反馈', purpose: '识别高风险假设' }],
    superpower: '把模糊需求变成可验证实验。',
    successStory: '理想候选人通过实验推动关键指标改善。',
    quote: '先验证最昂贵的假设。',
    painProfile: '岗位用于把 AI 能力转化为用户价值。',
  },
  actionGuide: {
    selfIntroTagline: '我擅长把复杂 AI 场景变成可验证决策。',
    cultureFitPhrase: '用小步实验建立共识。',
    questions: ['问题一？', '问题二？', '问题三？'] as [string, string, string],
    verificationChecklist: ['核实岗位负责产品'],
  },
};

function fixture() {
  const db = createTestDatabase();
  const positions = createPositionsRepository(db);
  const preparations = createPreparationsRepository(db);
  const prompts = createPromptsRepository(db);
  const position = positions.create({
    company: '远山科技',
    title: 'AI 产品经理',
    location: '上海',
    interest: 5,
    rawJd: '负责企业 AI 产品规划与用户研究。',
  });
  const completeJson = vi.fn<PreparationServiceDependencies['ai']['completeJson']>(async () => output);
  const completeJsonWithWebSearch = vi.fn<NonNullable<
    PreparationServiceDependencies['ai']['completeJsonWithWebSearch']
  >>(async () => output);
  const service = createPreparationService({
    positions,
    preparations,
    prompts,
    ai: { completeJson, completeJsonWithWebSearch } as PreparationServiceDependencies['ai'],
    getSettings: vi.fn(async () => ({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'Doubao-Seed-2.0-mini',
      apiKey: 'secret',
    })),
    now: () => '2026-08-08T08:00:00.000Z',
  });
  return { db, position, preparations, prompts, service, completeJson, completeJsonWithWebSearch };
}

describe('preparation service', () => {
  it('previews only position data and no personal assets', () => {
    const item = fixture();
    try {
      const preview = item.service.preview({ positionId: item.position.id });
      expect(preview.position).toMatchObject({ company: '远山科技', title: 'AI 产品经理', location: '上海' });
      expect(preview.selectedAssets).toEqual({ projects: [], questions: [] });
      expect(preview.jobDataJson).toContain(item.position.rawJd);
      expect(preview.jobDataJson).not.toContain('projectIds');
      expect(item.completeJsonWithWebSearch).not.toHaveBeenCalled();
    } finally {
      item.db.close();
    }
  });

  it('uses web search generation and stores an empty compatibility asset snapshot', async () => {
    const item = fixture();
    try {
      const saved = await item.service.generate({ positionId: item.position.id });
      expect(item.completeJsonWithWebSearch).toHaveBeenCalledOnce();
      expect(item.completeJson).not.toHaveBeenCalled();
      expect(JSON.parse(saved.assetsSnapshot)).toEqual({ projects: [], questions: [] });
      expect(JSON.parse(saved.outputSnapshot)).toEqual(output);
      const request = item.completeJsonWithWebSearch.mock.calls[0]?.[0];
      expect(request?.messages[1]?.content).toContain('companyAndProductResearch');
      expect(request?.messages[1]?.content).not.toContain('projectTalkingPoints');
    } finally {
      item.db.close();
    }
  });

  it('ignores deprecated asset selections instead of sending them', () => {
    const item = fixture();
    try {
      const preview = item.service.preview({
        positionId: item.position.id,
        projectIds: ['22222222-2222-4222-8222-222222222222'],
        questionIds: ['33333333-3333-4333-8333-333333333333'],
      });
      expect(preview.selectedAssets).toEqual({ projects: [], questions: [] });
    } finally {
      item.db.close();
    }
  });

  it('does not persist a material when generation fails', async () => {
    const item = fixture();
    try {
      item.completeJsonWithWebSearch.mockRejectedValueOnce(
        new AiServiceError('AI_PROVIDER_ERROR', 'provider unavailable'),
      );
      await expect(item.service.generate({ positionId: item.position.id }))
        .rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
      expect(item.preparations.listByPosition(item.position.id)).toEqual([]);
    } finally {
      item.db.close();
    }
  });
});
