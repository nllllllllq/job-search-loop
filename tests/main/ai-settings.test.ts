// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANNELS } from '../../src/shared/ipc';
import {
  createAiSettingsStore,
  type AiSettingsStore,
} from '../../src/main/services/ai-settings';
import { registerAiHandlers } from '../../src/main/ipc/ai';

const temporaryDirectories: string[] = [];

function settingsFixture(): {
  directory: string;
  settingsPath: string;
  store: AiSettingsStore;
} {
  const directory = mkdtempSync(join(tmpdir(), 'job-loop-ai-settings-'));
  temporaryDirectories.push(directory);
  const settingsPath = join(directory, 'ai-settings.json');
  const store = createAiSettingsStore({
    encrypt: async (value) => Buffer.from(`cipher:${Buffer.from(value).toString('base64')}`),
    decrypt: async (value) => Buffer.from(
      value.toString().replace('cipher:', ''),
      'base64',
    ).toString(),
    settingsPath,
  });
  return { directory, settingsPath, store };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('encrypted AI settings', () => {
  it('stores only encrypted key bytes and never returns the key publicly', async () => {
    const { settingsPath, store } = settingsFixture();

    await store.save({
      baseUrl: 'https://api.example.com/v1/',
      model: 'model-a',
      apiKey: 'sk-plain-secret',
    });

    const stored = readFileSync(settingsPath, 'utf8');
    expect(stored).not.toContain('sk-plain-secret');
    expect(JSON.parse(stored)).toMatchObject({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
    });
    expect(JSON.parse(stored).encryptedApiKey).toEqual(expect.any(String));
    expect(await store.getPublic()).toEqual({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      hasApiKey: true,
    });
    expect(await store.getPublic()).not.toHaveProperty('apiKey');
  });

  it('replaces a key when provided and keeps it when replacement is blank', async () => {
    const { store } = settingsFixture();
    await store.save({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      apiKey: 'first-key',
    });
    await store.save({
      baseUrl: 'https://api.example.com/v2/',
      model: 'model-b',
      apiKey: '',
    });
    expect(await store.getPrivate()).toEqual({
      baseUrl: 'https://api.example.com/v2',
      model: 'model-b',
      apiKey: 'first-key',
    });

    await store.save({
      baseUrl: 'https://api.example.com/v2',
      model: 'model-b',
      apiKey: 'second-key',
    });
    expect((await store.getPrivate()).apiKey).toBe('second-key');
  });

  it('reports an unconfigured state without creating a settings file', async () => {
    const { store } = settingsFixture();
    expect(await store.getPublic()).toEqual({
      baseUrl: '',
      model: '',
      hasApiKey: false,
    });
    await expect(store.getPrivate()).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
    });
  });

  it.each([
    'not-a-url',
    'ftp://api.example.com/v1',
    'file:///tmp/provider',
    'https://api.example.com/v1?token=secret',
    'https://user:pass@api.example.com/v1',
  ])('rejects unsupported endpoint %s', async (baseUrl) => {
    const { store } = settingsFixture();
    await expect(store.save({
      baseUrl,
      model: 'model-a',
      apiKey: 'secret',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects blank models and a first save without a key', async () => {
    const { store } = settingsFixture();
    await expect(store.save({
      baseUrl: 'https://api.example.com/v1',
      model: '   ',
      apiKey: 'secret',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.save({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      apiKey: '',
    })).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });

  it('fails closed with a stable error when the settings file is damaged', async () => {
    const { settingsPath, store } = settingsFixture();
    writeFileSync(settingsPath, '{"baseUrl":"https://api.example.com"');

    await expect(store.getPublic()).rejects.toMatchObject({
      code: 'AI_SETTINGS_CORRUPT',
    });
    await expect(store.save({
      baseUrl: 'https://api.example.com/v1',
      model: 'model-a',
      apiKey: '',
    })).rejects.toMatchObject({ code: 'AI_SETTINGS_CORRUPT' });

    writeFileSync(settingsPath, JSON.stringify({
      version: 1,
      baseUrl: 'javascript:alert(1)',
      model: 'model-a',
      encryptedApiKey: 'Y2lwaGVy',
    }));
    await expect(store.getPublic()).rejects.toMatchObject({
      code: 'AI_SETTINGS_CORRUPT',
    });
  });

  it('validates AI IPC requests before calling services', async () => {
    const handlers = new Map<
      string,
      (event: unknown, payload?: unknown) => unknown | Promise<unknown>
    >();
    const settings = {
      getPublic: vi.fn(),
      save: vi.fn(),
      getPrivate: vi.fn(),
    };
    const client = { testConnection: vi.fn() };
    registerAiHandlers(
      { handle: (channel, handler) => handlers.set(channel, handler) },
      settings,
      client,
    );

    await expect(
      handlers.get(CHANNELS.ai.settings.save)!({}, {
        baseUrl: 'javascript:alert(1)',
        model: '',
        apiKey: 4,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(settings.save).not.toHaveBeenCalled();

    await expect(
      handlers.get(CHANNELS.ai.testConnection)!({}, { url: 'https://evil.example' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(client.testConnection).not.toHaveBeenCalled();
  });
});
