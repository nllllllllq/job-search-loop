// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANNELS, type JobSearchApi } from '../../src/shared/ipc';

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: { invoke: electronMocks.invoke },
}));

await import('../../src/preload/index');

function exposedApi(): JobSearchApi {
  const call = electronMocks.exposeInMainWorld.mock.calls[0];
  if (!call || call[0] !== 'jobSearch') throw new Error('Preload API was not exposed');
  return call[1] as JobSearchApi;
}

const settings = {
  host: 'imap.example.com',
  port: 993,
  secure: true,
  email: 'user@example.com',
  username: 'user@example.com',
  enabled: true,
  intervalMinutes: 15,
  hasPassword: true,
  lastUid: 0,
  lastSyncAt: null,
  lastError: null,
};

describe('email preload contract', () => {
  beforeEach(() => electronMocks.invoke.mockReset());

  it('validates settings, connection, sync, and recent event responses', async () => {
    electronMocks.invoke
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce({ ok: true, message: '连接成功，可以同步邮件' })
      .mockResolvedValueOnce({
        processed: 1,
        applied: 1,
        pending: 0,
        skipped: 0,
        lastUid: 4,
        lastSyncAt: '2026-08-12T00:00:00.000Z',
        lastError: null,
      })
      .mockResolvedValueOnce([]);

    await expect(exposedApi().email?.settings.get()).resolves.toEqual(settings);
    await expect(exposedApi().email?.testConnection()).resolves.toMatchObject({ ok: true });
    await expect(exposedApi().email?.syncNow()).resolves.toMatchObject({ applied: 1 });
    await expect(exposedApi().email?.listRecent(50)).resolves.toEqual([]);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, CHANNELS.email.settings.get, undefined);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(4, CHANNELS.email.listRecent, { limit: 50 });
  });

  it('rejects invalid settings before invoking IPC', async () => {
    await expect(exposedApi().email?.settings.save({
      ...settings,
      password: '',
      port: 99_999,
    })).rejects.toBeDefined();
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });
});
