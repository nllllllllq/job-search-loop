// @vitest-environment node

import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { JobSearchApi } from '../../src/shared/ipc';
import { CHANNELS } from '../../src/shared/ipc';
import { registerPositionHandlers } from '../../src/main/ipc/positions';
import { registerIpcHandlers } from '../../src/main/ipc/register';
import { registerReviewHandlers } from '../../src/main/ipc/reviews';
import { registerSystemHandlers } from '../../src/main/ipc/system';
import { registerAssetHandlers } from '../../src/main/ipc/assets';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createTestDatabase } from '../helpers/database';
import { RepositoryError } from '../../src/main/repositories/common';

describe('typed IPC contract', () => {
  it('exposes a narrow validated capability merge handler backed by the repository transaction', async () => {
    const db = createTestDatabase();
    try {
      const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
      const ipcMain = {
        handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
          handlers.set(channel, handler);
        },
      };
      const assets = createAssetsRepository(db);
      const source = assets.saveCapability({
        name: '来源能力',
        jdFrequency: 1,
        evidence: '',
        gaps: '',
        mergedIntoId: null,
      });
      const target = assets.saveCapability({
        name: '目标能力',
        jdFrequency: 2,
        evidence: '',
        gaps: '',
        mergedIntoId: null,
      });
      registerAssetHandlers(ipcMain, assets, {
        list: vi.fn(),
        get: vi.fn(),
        save: vi.fn(),
      });

      const merge = handlers.get(CHANNELS.assets.capabilities.merge);
      expect(merge).toBeDefined();
      await expect(merge!({}, { sourceId: 'not-an-id', targetId: target.id }))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(merge!({}, { sourceId: source.id, targetId: target.id }))
        .resolves.toMatchObject({
          source: { id: source.id, mergedIntoId: target.id },
          target: { id: target.id, jdFrequency: 3 },
        });
    } finally {
      db.close();
    }
  });

  it('publishes explicit nested methods without a generic invoke or send escape hatch', () => {
    expectTypeOf<JobSearchApi>().toHaveProperty('positions');
    expectTypeOf<JobSearchApi>().toHaveProperty('ai');
    expectTypeOf<JobSearchApi>().toHaveProperty('preparations');
    expectTypeOf<JobSearchApi>().toHaveProperty('assets');
    expectTypeOf<JobSearchApi>().toHaveProperty('reviews');
    expectTypeOf<JobSearchApi>().toHaveProperty('system');

    expect(Object.keys(CHANNELS).sort()).toEqual([
      'ai',
      'assets',
      'positions',
      'preparations',
      'reviews',
      'system',
    ]);
    expect('invoke' in ({} as JobSearchApi)).toBe(false);
    expect('send' in ({} as JobSearchApi)).toBe(false);
  });

  it('rejects invalid position input before calling the repository', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      }),
    };
    const positions = {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      getDetail: vi.fn(),
      list: vi.fn(),
      remove: vi.fn(),
      listStages: vi.fn(),
      upsertStage: vi.fn(),
      reorderStages: vi.fn(),
    };
    registerPositionHandlers(ipcMain, positions);

    const createHandler = handlers.get(CHANNELS.positions.create);
    expect(createHandler).toBeDefined();
    await expect(createHandler!({}, {
      company: '',
      title: '产品经理',
      interest: 9,
      rawJd: '',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(positions.create).not.toHaveBeenCalled();
  });

  it('rejects unexpected payloads even for no-input methods', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    };
    const dashboard = { getSummary: vi.fn() };
    registerSystemHandlers(ipcMain, dashboard);

    await expect(
      handlers.get(CHANNELS.system.getDashboardSummary)!({}, { unexpected: true }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(dashboard.getSummary).not.toHaveBeenCalled();
  });

  it('registers handlers from injected repositories without a database or Electron singleton', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    };
    const created = {
      id: '4c10d827-2684-4bf0-9131-dd18b7ce8075',
      company: '远山科技',
      title: '产品经理',
      location: '',
      interest: 5 as const,
      rawJd: '负责产品规划',
      currentStage: 'interested' as const,
      finalResult: null,
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
    };
    const positions = {
      create: vi.fn(() => created),
      update: vi.fn(),
      get: vi.fn(),
      getDetail: vi.fn(),
      list: vi.fn(),
      remove: vi.fn(),
      listStages: vi.fn(),
      upsertStage: vi.fn(),
      reorderStages: vi.fn(),
    };
    const repositories = {
      positions,
      preparations: { create: vi.fn(), get: vi.fn(), listByPosition: vi.fn() },
      interviews: {
        create: vi.fn(),
        update: vi.fn(),
        get: vi.fn(),
        listByPosition: vi.fn(),
        saveSummary: vi.fn(),
      },
      assets: {
        listProjects: vi.fn(),
        getProject: vi.fn(),
        saveProject: vi.fn(),
        listQuestions: vi.fn(),
        getQuestion: vi.fn(),
        saveQuestion: vi.fn(),
        listCapabilities: vi.fn(),
        getCapability: vi.fn(),
        saveCapability: vi.fn(),
        mergeCapabilities: vi.fn(),
        listInsights: vi.fn(),
        getInsight: vi.fn(),
        saveInsight: vi.fn(),
        listVersions: vi.fn(),
      },
      prompts: { list: vi.fn(), get: vi.fn(), save: vi.fn() },
      proposals: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        commitReview: vi.fn(),
        commitCapabilityAnalysis: vi.fn(),
        accept: vi.fn(),
        ignore: vi.fn(),
      },
      dashboard: { getSummary: vi.fn() },
    };

    registerIpcHandlers(ipcMain, repositories);
    const createHandler = handlers.get(CHANNELS.positions.create);
    expect(createHandler).toBeDefined();
    await expect(createHandler!({}, {
      company: '远山科技',
      title: '产品经理',
      interest: 5,
      rawJd: '负责产品规划',
    })).resolves.toEqual(created);
    expect(positions.create).toHaveBeenCalledOnce();

    await expect(createHandler!({}, {
      company: '',
      title: '产品经理',
      interest: 5,
      rawJd: '',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(positions.create).toHaveBeenCalledOnce();
  });

  it('maps repository validation and conflict errors to safe IPC errors', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    };
    const positions = {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      getDetail: vi.fn(),
      list: vi.fn(),
      remove: vi.fn(),
      listStages: vi.fn(),
      upsertStage: vi.fn(),
      reorderStages: vi.fn(() => {
        throw new RepositoryError('VALIDATION_ERROR', '流程阶段顺序无效');
      }),
    };
    registerPositionHandlers(ipcMain, positions);
    const interviews = {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      listByPosition: vi.fn(),
      saveSummary: vi.fn(),
    };
    const proposals = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      commitReview: vi.fn(),
      commitCapabilityAnalysis: vi.fn(),
      accept: vi.fn(() => {
        throw new RepositoryError('CONFLICT', '建议已处理');
      }),
      ignore: vi.fn(),
    };
    registerReviewHandlers(ipcMain, interviews, proposals);
    const positionId = '4c10d827-2684-4bf0-9131-dd18b7ce8075';
    const stageId = '516b2bb0-2a31-4a1f-8dc7-b4f3e049f1d0';
    const proposalId = '2da6154e-fab3-4908-86e7-f2266c904670';

    await expect(handlers.get(CHANNELS.positions.reorderStages)!({}, {
      positionId,
      orderedIds: [stageId],
    })).rejects.toSatisfy(
      (error: unknown) => (
        error instanceof Error
        && 'code' in error
        && error.code === 'VALIDATION_ERROR'
        && error.message.includes('流程阶段顺序无效')
      ),
    );
    await expect(handlers.get(CHANNELS.reviews.proposals.accept)!({}, {
      id: proposalId,
      editedPayload: {},
    })).rejects.toSatisfy(
      (error: unknown) => (
        error instanceof Error
        && 'code' in error
        && error.code === 'CONFLICT'
        && error.message.includes('建议已处理')
      ),
    );
  });
});
