// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobSearchApi } from '../../src/shared/ipc';

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
  ])('rejects malformed %s responses from main IPC', async (_method, request) => {
    electronMocks.invoke.mockResolvedValueOnce({ unexpected: true });
    await expect(request()).rejects.toBeDefined();
    expect(electronMocks.invoke).toHaveBeenCalledOnce();
  });
});
