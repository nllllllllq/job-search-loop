// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEmailSettingsStore,
  type EmailSettingsDependencies,
} from '../../src/main/services/email-settings';

const directories: string[] = [];

function fixture(overrides: Partial<Pick<EmailSettingsDependencies, 'encrypt' | 'decrypt'>> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'job-loop-email-settings-'));
  directories.push(directory);
  const settingsPath = join(directory, 'email-settings.json');
  const store = createEmailSettingsStore({
    settingsPath,
    encrypt: overrides.encrypt ?? (async (value) => Buffer.from(`cipher:${value}`)),
    decrypt: overrides.decrypt ?? (async (value) => value.toString().replace('cipher:', '')),
  });
  return { settingsPath, store };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const base = {
  host: 'imap.example.com',
  port: 993,
  secure: true,
  email: 'user@example.com',
  username: 'user@example.com',
  enabled: true,
  intervalMinutes: 15,
};

describe('encrypted email settings', () => {
  it('stores only encrypted password bytes and returns safe public state', async () => {
    const { settingsPath, store } = fixture();
    await store.save({ ...base, password: 'secret-password' });

    const raw = readFileSync(settingsPath, 'utf8');
    expect(raw).not.toContain('secret-password');
    expect(JSON.parse(raw)).toHaveProperty('encryptedPassword');
    expect(await store.getPublic()).toMatchObject({ ...base, hasPassword: true, lastUid: 0 });
    expect(await store.getPrivate()).toMatchObject({ ...base, password: 'secret-password' });
  });

  it('preserves a blank password and requires replacement when host or email changes', async () => {
    const { store } = fixture();
    await store.save({ ...base, password: 'first' });
    await store.save({ ...base, password: '', enabled: false });
    expect((await store.getPrivate()).password).toBe('first');
    await expect(store.save({ ...base, host: 'other.example.com', password: '' }))
      .rejects.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });
    await expect(store.save({ ...base, email: 'other@example.com', password: '' }))
      .rejects.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });
  });

  it('requires a new password and resets sync state when the mailbox port changes', async () => {
    const { store } = fixture();
    await store.save({ ...base, password: 'first' });
    await store.updateSyncState({
      lastUid: 42,
      lastSyncAt: '2026-08-12T00:00:00.000Z',
      lastError: 'old error',
    });

    await expect(store.save({ ...base, port: 995, password: '' }))
      .rejects.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });

    const saved = await store.save({ ...base, port: 995, password: 'second' });
    expect(saved).toMatchObject({
      port: 995,
      lastUid: 0,
      lastSyncAt: null,
      lastError: null,
    });
    expect((await store.getPrivate()).password).toBe('second');
  });
});
