// @vitest-environment node

import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { JobSearchApi } from '../../src/shared/ipc';
import { CHANNELS } from '../../src/shared/ipc';
import { registerPositionHandlers } from '../../src/main/ipc/positions';
import { registerEmailHandlers } from '../../src/main/ipc/email';
import { EmailSettingsError } from '../../src/main/services/email-settings';
import { registerIpcHandlers } from '../../src/main/ipc/register';
import { registerReviewHandlers } from '../../src/main/ipc/reviews';
import { registerSystemHandlers } from '../../src/main/ipc/system';
import { registerAssetHandlers } from '../../src/main/ipc/assets';
import { registerPreparationTaskHandlers } from '../../src/main/ipc/tasks';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createTestDatabase } from '../helpers/database';
import { RepositoryError } from '../../src/main/repositories/common';

describe('typed IPC contract', () => {
  it('validates and forwards background preparation task IPC payloads', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = { handle(channel: string, handler: (event: unknown, payload: unknown) => unknown) {
      handlers.set(channel, handler);
    } };
    const task = {
      id: '11111111-1111-4111-8111-111111111111', kind: 'preparation' as const,
      positionId: '22222222-2222-4222-8222-222222222222', status: 'queued' as const,
      safeError: null, createdAt: '2026-08-01T00:00:00.000Z', startedAt: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const runtime = { start: vi.fn(() => task), get: vi.fn(() => task), listByPosition: vi.fn(() => [task]) };
    registerPreparationTaskHandlers(ipcMain, runtime);

    await expect(handlers.get(CHANNELS.preparations.start)!({}, {
      positionId: task.positionId, projectIds: [], questionIds: [],
    })).resolves.toEqual(task);
    expect(runtime.start).toHaveBeenCalledOnce();
    await expect(handlers.get(CHANNELS.preparations.start)!({}, {
      positionId: 'bad-id', projectIds: [], questionIds: [],
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(handlers.get(CHANNELS.tasks.listByPosition)!({}, 'bad-id'))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

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
    expectTypeOf<JobSearchApi>().toHaveProperty('tasks');
    expectTypeOf<JobSearchApi>().toHaveProperty('assets');
    expectTypeOf<JobSearchApi>().toHaveProperty('reviews');
    expectTypeOf<JobSearchApi>().toHaveProperty('imports');
    expectTypeOf<JobSearchApi>().toHaveProperty('system');
    expectTypeOf<JobSearchApi>().toHaveProperty('email');

    expect(Object.keys(CHANNELS).sort()).toEqual([
      'ai',
      'assets',
      'email',
      'imports',
      'positions',
      'preparations',
      'reviews',
      'system',
      'tasks',
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
      listGrouped: vi.fn(),
      listStages: vi.fn(),
      upsertStage: vi.fn(),
      reorderStages: vi.fn(),
      removeStage: vi.fn(),
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

  it('forwards the structured capability analysis output without proposal parsing', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    };
    const output = {
      capabilities: [{
        name: '结构化拆解',
        jdFrequency: 2,
        evidence: ['JD-A'],
        gaps: ['补充量化案例'],
      }],
    };
    const capabilityAnalysis = {
      preview: vi.fn(),
      confirm: vi.fn().mockResolvedValue(output),
    };
    registerSystemHandlers(ipcMain, { getSummary: vi.fn() }, capabilityAnalysis);

    await expect(
      handlers.get(CHANNELS.system.confirmCapabilityAnalysis)!(
        {},
        '11111111-1111-4111-8111-111111111111',
      ),
    ).resolves.toEqual(output);
    expect(capabilityAnalysis.confirm).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
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
      removeStage: vi.fn(),
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
        saveReview: vi.fn(),
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
      aiTasks: {
        createPreparation: vi.fn(), get: vi.fn(), listByPosition: vi.fn(),
        markRunning: vi.fn(), markSucceeded: vi.fn(), markFailed: vi.fn(),
        interruptRunningOnStartup: vi.fn(),
      },
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
      removeStage: vi.fn(),
    };
    registerPositionHandlers(ipcMain, positions);
    const interviews = {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      listByPosition: vi.fn(),
      saveSummary: vi.fn(),
      saveReview: vi.fn(),
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

  it('validates and forwards the create-only initial stage fields', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    };
    const created = {
      id: '44444444-4444-4444-8444-444444444444',
      company: '远山科技',
      title: '产品经理',
      location: '',
      interest: 5 as const,
      rawJd: '负责产品规划',
      currentStage: 'interview' as const,
      finalResult: null,
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    const positions = {
      create: vi.fn(() => created),
      update: vi.fn(),
      get: vi.fn(),
      getDetail: vi.fn(),
      list: vi.fn(),
      remove: vi.fn(),
      listGrouped: vi.fn(),
      listStages: vi.fn(),
      upsertStage: vi.fn(),
      reorderStages: vi.fn(),
      removeStage: vi.fn(),
    };
    registerPositionHandlers(ipcMain, positions);
    const createHandler = handlers.get(CHANNELS.positions.create);
    expect(createHandler).toBeDefined();

    await expect(createHandler!({}, {
      company: '远山科技',
      title: '产品经理',
      interest: 5,
      rawJd: '负责产品规划',
      initialStage: 'interview',
      initialDate: '2026-08-12',
    })).resolves.toEqual(created);
    expect(positions.create).toHaveBeenCalledWith(expect.objectContaining({
      initialStage: 'interview',
      initialDate: '2026-08-12',
    }));

    await expect(createHandler!({}, {
      company: '远山科技',
      title: '产品经理',
      interest: 5,
      rawJd: '负责产品规划',
      initialStage: 'rejected',
      initialDate: '2026-08-12',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(positions.create).toHaveBeenCalledOnce();
  });

  it('validates email IPC payloads before invoking settings or sync services', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    };
    const settings = {
      getPublic: vi.fn(async () => ({
        host: 'imap.example.com', port: 993, secure: true, email: 'user@example.com',
        username: 'user@example.com', enabled: true, intervalMinutes: 15,
        hasPassword: true, lastUid: 0, lastSyncAt: null, lastError: null,
      })),
      save: vi.fn(),
      getPrivate: vi.fn(),
      updateSyncState: vi.fn(),
    };
    const sync = {
      testConnection: vi.fn(async () => ({ ok: true as const, message: '连接成功，可以同步邮件' })),
      syncNow: vi.fn(async () => ({
        processed: 0, applied: 0, pending: 0, skipped: 0,
        lastUid: 0, lastSyncAt: null, lastError: null,
      })),
      listRecent: vi.fn(() => []),
    };
    registerEmailHandlers(ipcMain, settings, sync);

    await expect(handlers.get(CHANNELS.email.settings.get)!({}, { unexpected: true }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(handlers.get(CHANNELS.email.listRecent)!({}, { limit: 51 }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(settings.getPublic).not.toHaveBeenCalled();
    expect(sync.listRecent).not.toHaveBeenCalled();
  });

  it('maps email settings failures and invokes the save callback only after success', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    };
    const publicSettings = {
      host: 'imap.example.com', port: 993, secure: true, email: 'user@example.com',
      username: 'user@example.com', enabled: true, intervalMinutes: 15,
      hasPassword: true, lastUid: 0, lastSyncAt: null, lastError: null,
    };
    const settings = {
      getPublic: vi.fn(async () => { throw new EmailSettingsError('EMAIL_SETTINGS_CORRUPT', 'secret diagnostic'); }),
      save: vi.fn(async () => publicSettings),
      getPrivate: vi.fn(),
      updateSyncState: vi.fn(),
    };
    const sync = {
      testConnection: vi.fn(async () => ({ ok: true as const, message: 'ok' })),
      syncNow: vi.fn(async () => ({
        processed: 0, applied: 0, pending: 0, skipped: 0,
        lastUid: 0, lastSyncAt: null, lastError: null,
      })),
      listRecent: vi.fn(() => []),
    };
    const onSettingsSaved = vi.fn();
    registerEmailHandlers(ipcMain, settings, sync, onSettingsSaved);

    await expect(handlers.get(CHANNELS.email.settings.get)!({}, undefined))
      .rejects.toMatchObject({ code: 'EMAIL_SETTINGS_CORRUPT' });
    await expect(handlers.get(CHANNELS.email.settings.save)!({}, {
      host: publicSettings.host,
      port: publicSettings.port,
      secure: publicSettings.secure,
      email: publicSettings.email,
      username: publicSettings.username,
      password: 'secret',
      enabled: publicSettings.enabled,
      intervalMinutes: publicSettings.intervalMinutes,
    })).resolves.toEqual(publicSettings);
    expect(onSettingsSaved).toHaveBeenCalledWith(publicSettings);
  });

  it('hides unknown test-connection diagnostics behind a safe app error', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipcMain = {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    };
    const settings = {
      getPublic: vi.fn(),
      save: vi.fn(),
      getPrivate: vi.fn(),
      updateSyncState: vi.fn(),
    };
    const sync = {
      testConnection: vi.fn(async () => { throw new Error('password=do-not-leak'); }),
      syncNow: vi.fn(),
      listRecent: vi.fn(() => []),
    };
    registerEmailHandlers(ipcMain, settings, sync);

    await expect(handlers.get(CHANNELS.email.testConnection)!({}, undefined))
      .rejects.toSatisfy((error: Error) => (
        (error as Error & { code?: string }).code === 'EMAIL_CONNECTION_FAILED'
        && !error.message.includes('password=do-not-leak')
      ));
  });

  it('validates and forwards the narrow stage removal payload', async () => {
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
      listGrouped: vi.fn(),
      remove: vi.fn(),
      listStages: vi.fn(),
      upsertStage: vi.fn(),
      reorderStages: vi.fn(),
      removeStage: vi.fn().mockReturnValue([]),
    };
    registerPositionHandlers(ipcMain, positions);
    const positionId = '4c10d827-2684-4bf0-9131-dd18b7ce8075';
    const stageId = '516b2bb0-2a31-4a1f-8dc7-b4f3e049f1d0';

    await expect(handlers.get(CHANNELS.positions.removeStage)!({}, {
      positionId,
      stageId,
    })).resolves.toEqual([]);
    expect(positions.removeStage).toHaveBeenCalledWith(positionId, stageId);
    await expect(handlers.get(CHANNELS.positions.removeStage)!({}, {
      positionId: 'not-an-id',
      stageId,
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
