// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createPreparationsRepository } from '../../src/main/repositories/preparations';
import { createPromptsRepository } from '../../src/main/repositories/prompts';
import { registerPreparationHandlers } from '../../src/main/ipc/positions';
import { createPreparationService } from '../../src/main/services/preparation';
import type { JobSearchApi } from '../../src/shared/ipc';
import { createTestDatabase } from '../helpers/database';

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
  },
}));

await import('../../src/preload/index');

function exposedApi(): JobSearchApi {
  const call = electronMocks.exposeInMainWorld.mock.calls[0];
  if (!call || call[0] !== 'jobSearch') {
    throw new Error('Preload API was not exposed');
  }
  return call[1] as JobSearchApi;
}

describe('preload preparation contract', () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset();
  });

  it.each([
    ['list', () => exposedApi().preparations.list('not-a-uuid')],
    ['get', () => exposedApi().preparations.get('not-a-uuid')],
  ])('rejects invalid %s IDs before invoking main IPC', async (_method, request) => {
    await expect(request()).rejects.toBeDefined();
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });

  it('rejects invalid generate input before invoking main IPC', async () => {
    await expect(exposedApi().preparations.generate({
      positionId: 'not-a-uuid',
      projectIds: [],
      questionIds: [],
    })).rejects.toBeDefined();
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });

  it('rejects invalid background preparation start input before invoking main IPC', async () => {
    await expect(exposedApi().preparations.start({
      positionId: 'not-a-uuid',
      projectIds: [],
      questionIds: [],
    })).rejects.toBeDefined();
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });

  it('rejects invalid preview input before invoking main IPC', async () => {
    await expect(exposedApi().preparations.preview({
      positionId: 'not-a-uuid',
      projectIds: [],
      questionIds: [],
    })).rejects.toBeDefined();
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['list', () => exposedApi().preparations.list(
      '11111111-1111-4111-8111-111111111111',
    )],
    ['get', () => exposedApi().preparations.get(
      '22222222-2222-4222-8222-222222222222',
    )],
    ['generate', () => exposedApi().preparations.generate({
      positionId: '11111111-1111-4111-8111-111111111111',
      projectIds: [],
      questionIds: [],
    })],
    ['preview', () => exposedApi().preparations.preview({
      positionId: '11111111-1111-4111-8111-111111111111',
      projectIds: [],
      questionIds: [],
    })],
    ['start', () => exposedApi().preparations.start({
      positionId: '11111111-1111-4111-8111-111111111111',
      projectIds: [],
      questionIds: [],
    })],
  ])('rejects malformed %s responses from main IPC', async (_method, request) => {
    electronMocks.invoke.mockResolvedValueOnce({ unexpected: true });
    await expect(request()).rejects.toBeDefined();
    expect(electronMocks.invoke).toHaveBeenCalledOnce();
  });

  it('passes a real project-and-question preview through service, main and preload validation', async () => {
    const database = createTestDatabase();
    try {
      const positions = createPositionsRepository(database);
      const assets = createAssetsRepository(database);
      const preparations = createPreparationsRepository(database);
      const prompts = createPromptsRepository(database);
      const position = positions.create({
        company: '远山科技',
        title: 'AI 产品经理',
        interest: 5,
        rawJd: '需要用户研究与 AI 产品规划。',
      });
      const project = assets.saveProject({
        name: '增长实验',
        background: '用户不知道第一步。',
        goal: '提升留存。',
        role: '产品负责人',
        keyDecisions: '先验证路径。',
        outcome: '指标提升。',
        evidence: '实验数据。',
        reflections: '更早建立对照组。',
        storytellingVersions: '两分钟版本。',
      });
      const question = assets.saveQuestion({
        type: 'interviewer',
        text: '如何验证需求？',
        answerDraft: '先验证高风险假设。',
        projectIds: [project.id],
        capabilityIds: [],
        occurrenceCount: 1,
        status: 'active',
      });
      const service = createPreparationService({
        positions,
        assets,
        preparations,
        prompts,
        ai: { completeJson: vi.fn(async () => ({})) },
        getSettings: vi.fn(async () => ({
          baseUrl: 'https://api.example.com/v1',
          model: 'model-a',
          apiKey: 'secret',
        })),
      });
      const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
      registerPreparationHandlers({
        handle(channel, handler) {
          handlers.set(channel, handler);
        },
      }, preparations, service);
      electronMocks.invoke.mockImplementation(async (channel, payload) => {
        const handler = handlers.get(String(channel));
        if (!handler) throw new Error('missing handler');
        return handler({}, payload);
      });

      const result = await exposedApi().preparations.preview({
        positionId: position.id,
        projectIds: [project.id],
        questionIds: [question.id],
      });

      expect(result.selectedAssets.projects).toEqual([project]);
      expect(result.selectedAssets.questions).toEqual([question]);
      expect(result.jobDataJson).toContain(JSON.stringify(position.rawJd));
      expect(service.preview({
        positionId: position.id,
        projectIds: [project.id],
        questionIds: [question.id],
      }).jobDataJson).toBe(result.jobDataJson);
    } finally {
      database.close();
    }
  });
});
