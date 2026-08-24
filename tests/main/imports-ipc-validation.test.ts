// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { registerImportHandlers } from '../../src/main/ipc/imports';
import { CHANNELS } from '../../src/shared/ipc';

describe('image import IPC validation', () => {
  it('returns the exact image limit error before creating an AI request', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    registerImportHandlers({
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    });

    const preview = handlers.get(CHANNELS.imports.previewPositionFromImages);
    expect(preview).toBeDefined();
    await expect(preview!({}, {
      images: [{
        name: 'job.gif',
        type: 'image/gif',
        bytes: new Uint8Array([1]),
        width: 100,
        height: 100,
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('Only PNG and JPEG images are supported.'),
    });
  });
});
