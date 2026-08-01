// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobSearchApi } from '../../src/shared/ipc';

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

describe('import preload contract', () => {
  beforeEach(() => electronMocks.invoke.mockReset());

  it('rejects unsupported image types before invoking IPC', async () => {
    expect(() => exposedApi().imports.previewPositionFromImages([{
      name: 'job.gif',
      type: 'image/gif',
      bytes: new Uint8Array([1]),
      width: 100,
      height: 100,
    }])).toThrow('Only PNG and JPEG images are supported.');

    expect(electronMocks.invoke).not.toHaveBeenCalled();
  });
});
