// @vitest-environment node

import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { JobSearchApi } from '../../src/shared/ipc';
import { CHANNELS } from '../../src/shared/ipc';
import { registerPositionHandlers } from '../../src/main/ipc/positions';
import { registerSystemHandlers } from '../../src/main/ipc/system';

describe('typed IPC contract', () => {
  it('publishes explicit nested methods without a generic invoke or send escape hatch', () => {
    expectTypeOf<JobSearchApi>().toHaveProperty('positions');
    expectTypeOf<JobSearchApi>().toHaveProperty('preparations');
    expectTypeOf<JobSearchApi>().toHaveProperty('assets');
    expectTypeOf<JobSearchApi>().toHaveProperty('reviews');
    expectTypeOf<JobSearchApi>().toHaveProperty('system');

    expect(Object.keys(CHANNELS).sort()).toEqual([
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
});
