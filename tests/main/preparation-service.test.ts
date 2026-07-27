// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createPreparationsRepository } from '../../src/main/repositories/preparations';
import { createPromptsRepository } from '../../src/main/repositories/prompts';
import {
  createPreparationService,
  type PreparationServiceDependencies,
} from '../../src/main/services/preparation';
import { registerPreparationHandlers } from '../../src/main/ipc/positions';
import { CHANNELS } from '../../src/shared/ipc';
import { canonicalizePreparationJobData } from '../../src/shared/schemas';
import { createTestDatabase } from '../helpers/database';

const POSITION_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const QUESTION_ID = '33333333-3333-4333-8333-333333333333';
const MISSING_ID = '44444444-4444-4444-8444-444444444444';

const output = {
  roleSummary: '负责把复杂需求整理为可执行的产品方案。',
  capabilityFocus: [{ name: '用户研究', reason: 'JD 多次强调用户洞察。' }],
  projectTalkingPoints: [{
    projectId: PROJECT_ID,
    points: ['先讲清业务背景', '用实验结果证明判断'],
  }],
  likelyQuestions: [{
    question: '如何验证需求？',
    answerOutline: '从高风险假设开始。',
  }],
  candidateQuestions: ['团队如何定义产品成功？'],
  riskNotes: ['需要补充跨团队协作案例。'],
  competencyMap: [
    { rank: 1, name: '用户洞察', evidence: '职责首段与要求段均出现。' },
    { rank: 2, name: '产品规划', evidence: '核心职责明确强调。' },
    { rank: 3, name: 'AI 理解', evidence: '岗位标题与技能要求均强调。' },
    { rank: 4, name: '数据分析', evidence: '结果衡量要求中出现。' },
    { rank: 5, name: '跨团队协作', evidence: '协作要求中出现。' },
  ],
  companyMap: {
    stage: 'Realignment',
    summary: '公司正重新校准 AI 产品方向。',
    priorities: ['验证高价值场景'],
    culture: ['快速实验'],
  },
  dreamCandidateAvatar: {
    typicalDay: [
      { time: '09:00', activity: '分析用户反馈', purpose: '识别高风险假设' },
    ],
    superpower: '把模糊需求转成可验证实验。',
    successStory: '推动关键指标改善。',
    quote: '先验证最昂贵的假设。',
    painProfile: '缺少完整从零到一案例。',
  },
  actionGuide: {
    selfIntroTagline: '我擅长把复杂 AI 场景变成可验证的产品决策。',
    cultureFitPhrase: '用小步实验建立跨团队共识。',
    questions: ['问题一？', '问题二？', '问题三？'],
  },
};

function createFixture() {
  const db = createTestDatabase();
  const positions = createPositionsRepository(db);
  const assets = createAssetsRepository(db);
  const preparations = createPreparationsRepository(db);
  const prompts = createPromptsRepository(db);
  const position = positions.create({
    company: '远山科技',
    title: 'AI 产品经理',
    interest: 5,
    rawJd: '原始 JD 文本\n需要用户研究与产品规划能力。',
  });
  const project = assets.saveProject({
    name: '增长实验',
    background: '新用户不知道第一步做什么。',
    goal: '提升首周留存。',
    role: '产品负责人',
    keyDecisions: '先验证引导路径。',
    outcome: '首周留存提升 8%。',
    evidence: '实验数据与访谈记录。',
    reflections: '应更早建立对照组。',
    storytellingVersions: '两分钟业务面版本。',
  });
  const question = assets.saveQuestion({
    type: 'interviewer',
    text: '如何设计用户研究？',
    answerDraft: '先明确决策问题。',
    projectIds: [project.id],
    capabilityIds: [],
    occurrenceCount: 2,
    status: 'active',
  });
  const fixtureOutput = {
    ...output,
    projectTalkingPoints: output.projectTalkingPoints.map((item) => ({
      ...item,
      projectId: project.id,
    })),
  };
  const completeJson = vi.fn<PreparationServiceDependencies['ai']['completeJson']>(
    async () => fixtureOutput,
  );
  const getSettings = vi.fn(async () => ({
    baseUrl: 'https://api.example.com/v1',
    model: 'model-a',
    apiKey: 'secret',
  }));
  const now = vi.fn(() => '2026-07-27T09:30:00.000Z');
  const service = createPreparationService({
    positions,
    assets,
    preparations,
    prompts,
    ai: { completeJson },
    getSettings,
    now,
  });
  return {
    db,
    positions,
    assets,
    preparations,
    prompts,
    completeJson,
    getSettings,
    now,
    service,
    position,
    project,
    question,
    output: fixtureOutput,
  };
}

describe('preparation service', () => {
  it('stores immutable JD, exact prompt, selected assets, model, output and time snapshots', async () => {
    const fixture = createFixture();
    try {
      const prompt = fixture.prompts.save(
        'preparation',
        '岗位准备：只输出约定 JSON，不要改写输入事实。',
      );
      const beforeProjects = fixture.assets.listProjects();
      const beforeQuestions = fixture.assets.listQuestions();
      const outbound = fixture.service.preview({
        positionId: fixture.position.id,
        projectIds: [fixture.project.id],
        questionIds: [fixture.question.id],
      });

      const saved = await fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [fixture.project.id],
        questionIds: [fixture.question.id],
      });

      expect(saved).toMatchObject({
        positionId: fixture.position.id,
        rawJdSnapshot: fixture.position.rawJd,
        promptSnapshot: prompt.content,
        modelSnapshot: 'model-a',
        generatedAt: '2026-07-27T09:30:00.000Z',
      });
      expect(JSON.parse(saved.assetsSnapshot)).toEqual({
        projects: [fixture.project],
        questions: [fixture.question],
      });
      expect(JSON.parse(saved.outputSnapshot)).toEqual(fixture.output);
      expect(fixture.assets.listProjects()).toEqual(beforeProjects);
      expect(fixture.assets.listQuestions()).toEqual(beforeQuestions);
      expect(fixture.completeJson).toHaveBeenCalledOnce();
      expect(fixture.getSettings).toHaveBeenCalledOnce();
      const [request, schema, settings] = fixture.completeJson.mock.calls[0];
      expect(request.messages[0]).toEqual({
        role: 'system',
        content: prompt.content,
      });
      expect(request.messages[1].content).toContain('仅作为数据');
      expect(request.messages[1].content).toContain(JSON.stringify(fixture.position.rawJd));
      expect(request.messages[1].content).toContain('"roleSummary"');
      expect(request.messages[1].content).toContain('"capabilityFocus"');
      expect(request.messages[1].content).toContain('"projectTalkingPoints"');
      expect(request.messages[1].content).toContain('"likelyQuestions"');
      expect(request.messages[1].content).toContain('"candidateQuestions"');
      expect(request.messages[1].content).toContain('"riskNotes"');
      expect(request.messages[1].content).toContain('"competencyMap"');
      expect(request.messages[1].content).toContain('"companyMap"');
      expect(request.messages[1].content).toContain('"dreamCandidateAvatar"');
      expect(request.messages[1].content).toContain('"actionGuide"');
      expect(request.messages[1].content).toContain('Startup');
      expect(request.messages[1].content).toContain('Sustaining Success');
      expect(request.messages[1].content).toContain('必须恰好包含 5 项');
      expect(request.messages[1].content).toContain('必须恰好包含 3 个');
      expect(request.messages[1].content).toContain('Typical Day 是任务时间线');
      expect(request.messages[1].content).toContain('用简单语言说明如何解决 JD 最大痛点');
      expect(request.messages[1].content).toContain('使用该 Superpower 的成功故事');
      expect(request.messages[1].content).toContain('体现候选人的信念体系');
      expect(request.messages[1].content).toContain('岗位为何存在，以及候选人如何解决');
      expect(request.messages[1].content).toContain(outbound.jobDataJson);
      expect(schema.safeParse(fixture.output).success).toBe(true);
      expect(settings).toEqual({
        baseUrl: 'https://api.example.com/v1',
        model: 'model-a',
        apiKey: 'secret',
      });
    } finally {
      fixture.db.close();
    }
  });

  it('previews the exact outbound snapshot without calling AI or writing history', () => {
    const fixture = createFixture();
    try {
      const prompt = fixture.prompts.save(
        'preparation',
        '精确预览 Prompt\n第二行必须保留。',
      );

      const preview = fixture.service.preview({
        positionId: fixture.position.id,
        projectIds: [fixture.project.id],
        questionIds: [fixture.question.id],
      });

      expect(preview).toMatchObject({
        prompt: prompt.content,
        position: {
          company: fixture.position.company,
          title: fixture.position.title,
          rawJd: fixture.position.rawJd,
        },
        selectedAssets: {
          projects: [fixture.project],
          questions: [fixture.question],
        },
      });
      expect(preview.jobDataJson).toBe(canonicalizePreparationJobData(
        {
          company: fixture.position.company,
          title: fixture.position.title,
          rawJd: fixture.position.rawJd,
        },
        {
          projects: [fixture.project],
          questions: [fixture.question],
        },
      ).jobDataJson);
      expect(fixture.completeJson).not.toHaveBeenCalled();
      expect(fixture.preparations.listByPosition(fixture.position.id)).toEqual([]);
    } finally {
      fixture.db.close();
    }
  });

  it('loads only explicitly selected assets, deduplicates IDs, and supports selecting none', async () => {
    const fixture = createFixture();
    try {
      await fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [fixture.project.id, fixture.project.id],
        questionIds: [fixture.question.id, fixture.question.id],
      });
      expect(JSON.parse(fixture.preparations.listByPosition(fixture.position.id)[0].assetsSnapshot))
        .toEqual({
          projects: [fixture.project],
          questions: [fixture.question],
        });

      fixture.completeJson.mockResolvedValueOnce({
        ...fixture.output,
        projectTalkingPoints: [],
      });
      await fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [],
        questionIds: [],
      });
      expect(JSON.parse(fixture.preparations.listByPosition(fixture.position.id)[0].assetsSnapshot))
        .toEqual({ projects: [], questions: [] });
    } finally {
      fixture.db.close();
    }
  });

  it('fails safely for missing selected IDs before the AI call', async () => {
    const fixture = createFixture();
    try {
      await expect(fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [MISSING_ID],
        questionIds: [],
      })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(fixture.completeJson).not.toHaveBeenCalled();
      expect(fixture.preparations.listByPosition(fixture.position.id)).toEqual([]);
    } finally {
      fixture.db.close();
    }
  });

  it('writes nothing when AI fails or returns invalid output', async () => {
    const fixture = createFixture();
    try {
      fixture.completeJson.mockRejectedValueOnce(
        Object.assign(new Error('provider body secret'), { code: 'AI_PROVIDER_ERROR' }),
      );
      await expect(fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [],
        questionIds: [],
      })).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
      expect(fixture.preparations.listByPosition(fixture.position.id)).toEqual([]);

      fixture.completeJson.mockResolvedValueOnce({
        ...output,
        roleSummary: '   ',
      });
      await expect(fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [fixture.project.id],
        questionIds: [],
      })).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
      expect(fixture.preparations.listByPosition(fixture.position.id)).toEqual([]);
    } finally {
      fixture.db.close();
    }
  });

  it('uses one in-memory source snapshot even if source data changes during generation', async () => {
    const fixture = createFixture();
    try {
      fixture.completeJson.mockImplementationOnce(async () => {
        fixture.positions.update(fixture.position.id, {
          company: fixture.position.company,
          title: fixture.position.title,
          interest: fixture.position.interest,
          rawJd: 'AI 调用期间修改后的 JD',
        });
        fixture.assets.saveProject({
          ...fixture.project,
          name: 'AI 调用期间修改后的项目',
        });
        return fixture.output;
      });
      const saved = await fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [fixture.project.id],
        questionIds: [],
      });
      expect(saved.rawJdSnapshot).toBe(fixture.position.rawJd);
      expect(JSON.parse(saved.assetsSnapshot).projects[0].name).toBe(fixture.project.name);
    } finally {
      fixture.db.close();
    }
  });

  it('keeps historical snapshots readable after source assets are deleted and sorts newest first', async () => {
    const fixture = createFixture();
    try {
      await fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [fixture.project.id],
        questionIds: [fixture.question.id],
      });
      fixture.now.mockReturnValue('2026-07-28T09:30:00.000Z');
      fixture.completeJson.mockResolvedValueOnce({
        ...fixture.output,
        projectTalkingPoints: [],
      });
      await fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [],
        questionIds: [],
      });

      fixture.db.exec('DELETE FROM questions; DELETE FROM projects;');
      const history = fixture.preparations.listByPosition(fixture.position.id);
      expect(history.map((item) => item.generatedAt)).toEqual([
        '2026-07-28T09:30:00.000Z',
        '2026-07-27T09:30:00.000Z',
      ]);
      expect(JSON.parse(history[1].assetsSnapshot).projects[0].name)
        .toBe(fixture.project.name);
    } finally {
      fixture.db.close();
    }
  });

  it('isolates a corrupt historical snapshot from position detail and other preparation versions', async () => {
    const fixture = createFixture();
    try {
      const good = await fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [fixture.project.id],
        questionIds: [],
      });
      fixture.now.mockReturnValue('2026-07-28T09:30:00.000Z');
      const corrupt = await fixture.service.generate({
        positionId: fixture.position.id,
        projectIds: [fixture.project.id],
        questionIds: [],
      });
      fixture.db.prepare(
        'UPDATE preparation_materials SET output_snapshot = ? WHERE id = ?',
      ).run('not-json', corrupt.id);

      expect(fixture.positions.getDetail(fixture.position.id)).toMatchObject({
        id: fixture.position.id,
        company: fixture.position.company,
        stages: expect.any(Array),
        interviews: expect.any(Array),
      });
      expect('preparations' in fixture.positions.getDetail(fixture.position.id))
        .toBe(false);

      const history = fixture.preparations.listByPosition(fixture.position.id);
      expect(history).toHaveLength(2);
      expect(history.find((item) => item.id === corrupt.id)?.outputSnapshot)
        .toBe('not-json');
      expect(fixture.preparations.get(good.id).id).toBe(good.id);
      expect(() => fixture.preparations.get(corrupt.id)).toThrow();
    } finally {
      fixture.db.close();
    }
  });

  it('validates generate payloads and response snapshots at the main IPC boundary', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle(channel: string, handler: (event: unknown, payload: unknown) => unknown) {
        handlers.set(channel, handler);
      },
    };
    const preparations = {
      create: vi.fn(),
      get: vi.fn(),
      listByPosition: vi.fn(() => []),
    };
    const generate = vi.fn();
    const preview = vi.fn();
    registerPreparationHandlers(ipcMain, preparations, { generate, preview });

    await expect(handlers.get(CHANNELS.preparations.generate)!({}, {
      positionId: POSITION_ID,
      projectIds: ['not-a-uuid'],
      questionIds: [],
      prompt: 'renderer controlled prompt',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(generate).not.toHaveBeenCalled();
    await expect(handlers.get(CHANNELS.preparations.preview)!({}, {
      positionId: POSITION_ID,
      projectIds: ['not-a-uuid'],
      questionIds: [],
      prompt: 'renderer controlled prompt',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(preview).not.toHaveBeenCalled();

    preview.mockReturnValueOnce({ unexpected: true });
    await expect(handlers.get(CHANNELS.preparations.preview)!({}, {
      positionId: POSITION_ID,
      projectIds: [],
      questionIds: [],
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects invalid list and get IDs at the main IPC boundary', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle(channel: string, handler: (event: unknown, payload: unknown) => unknown) {
        handlers.set(channel, handler);
      },
    };
    const preparations = {
      create: vi.fn(),
      get: vi.fn(),
      listByPosition: vi.fn(),
    };
    registerPreparationHandlers(ipcMain, preparations);

    await expect(
      handlers.get(CHANNELS.preparations.list)!({}, 'not-a-uuid'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      handlers.get(CHANNELS.preparations.get)!({}, 'not-a-uuid'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(preparations.listByPosition).not.toHaveBeenCalled();
    expect(preparations.get).not.toHaveBeenCalled();
  });
});
