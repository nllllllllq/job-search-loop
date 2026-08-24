// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANNELS, type JobSearchApi } from '../../src/shared/ipc';

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
  if (!call || call[0] !== 'jobSearch') throw new Error('Preload API was not exposed');
  return call[1] as JobSearchApi;
}

const sourceId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-07-28T00:00:00.000Z';

describe('asset preload contract', () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset();
  });

  it('validates capability merge ids before IPC and validates the returned pair', async () => {
    await expect(exposedApi().assets.capabilities.merge('invalid', targetId))
      .rejects.toBeDefined();
    expect(electronMocks.invoke).not.toHaveBeenCalled();

    electronMocks.invoke.mockResolvedValueOnce({
      source: {
        id: sourceId,
        name: '来源',
        jdFrequency: 1,
        evidence: '',
        gaps: '',
        mergedIntoId: targetId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      target: {
        id: targetId,
        name: '目标',
        jdFrequency: 3,
        evidence: '',
        gaps: '',
        mergedIntoId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });

    await expect(exposedApi().assets.capabilities.merge(sourceId, targetId))
      .resolves.toMatchObject({
        source: { id: sourceId, mergedIntoId: targetId },
        target: { id: targetId, jdFrequency: 3 },
      });
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      CHANNELS.assets.capabilities.merge,
      { sourceId, targetId },
    );

    electronMocks.invoke.mockResolvedValueOnce({ source: {}, target: {} });
    await expect(exposedApi().assets.capabilities.merge(sourceId, targetId))
      .rejects.toBeDefined();
  });
});
