import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import type {
  EmailSettingsPrivate,
  EmailSettingsPublic,
  EmailSettingsSaveInput,
} from '../../shared/domain';
import { emailSettingsSaveSchema } from '../../shared/schemas';
import type { AppError } from '../../shared/ipc';

const encryptedValueSchema = z.string().min(1).regex(
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
);

const storedSettingsSchema = z.object({
  version: z.literal(1),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65_535),
  secure: z.boolean(),
  email: z.string().trim().email().max(320),
  username: z.string().trim().min(1).max(320),
  encryptedPassword: encryptedValueSchema,
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(1).max(1_440),
  lastUid: z.number().int().nonnegative(),
  lastSyncAt: z.string().datetime().nullable(),
  lastError: z.string().max(2_000).nullable(),
}).strict();

type EmailSettingsErrorCode = Extract<
  AppError['code'],
  'VALIDATION_ERROR' | 'EMAIL_SETTINGS_CORRUPT' | 'EMAIL_SETTINGS_UNAVAILABLE' | 'EMAIL_NOT_CONFIGURED'
>;

export class EmailSettingsError extends Error {
  constructor(public readonly code: EmailSettingsErrorCode, message: string) {
    super(message);
    this.name = 'EmailSettingsError';
  }
}

interface StoredSettings {
  version: 1;
  host: string;
  port: number;
  secure: boolean;
  email: string;
  username: string;
  encryptedPassword: string;
  enabled: boolean;
  intervalMinutes: number;
  lastUid: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface EmailSyncState {
  lastUid: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface EmailSettingsStore {
  getPublic(): Promise<EmailSettingsPublic>;
  getPrivate(): Promise<EmailSettingsPrivate>;
  save(input: EmailSettingsSaveInput): Promise<EmailSettingsPublic>;
  updateSyncState(state: EmailSyncState): Promise<EmailSettingsPublic>;
}

export interface EmailSettingsDependencies {
  encrypt(value: string): Buffer | Promise<Buffer>;
  decrypt(value: Buffer): string | Promise<string>;
  settingsPath: string;
}

function serviceError(code: EmailSettingsErrorCode, message: string): EmailSettingsError {
  return new EmailSettingsError(code, message);
}

function emptyPublic(): EmailSettingsPublic {
  return {
    host: '',
    port: 993,
    secure: true,
    email: '',
    username: '',
    enabled: false,
    intervalMinutes: 15,
    hasPassword: false,
    lastUid: 0,
    lastSyncAt: null,
    lastError: null,
  };
}

export function createEmailSettingsStore({
  encrypt,
  decrypt,
  settingsPath,
}: EmailSettingsDependencies): EmailSettingsStore {
  const readStored = async (): Promise<StoredSettings | null> => {
    let content: string;
    try {
      content = await readFile(settingsPath, 'utf8');
    } catch (error) {
      if (
        error !== null
        && typeof error === 'object'
        && 'code' in error
        && error.code === 'ENOENT'
      ) return null;
      throw serviceError('EMAIL_SETTINGS_UNAVAILABLE', '邮箱配置文件无法安全读取');
    }
    try {
      return storedSettingsSchema.parse(JSON.parse(content));
    } catch {
      throw serviceError('EMAIL_SETTINGS_CORRUPT', '邮箱配置文件已损坏，请重新配置');
    }
  };

  const publicValue = (stored: StoredSettings | null): EmailSettingsPublic => {
    if (stored === null) return emptyPublic();
    return {
      host: stored.host,
      port: stored.port,
      secure: stored.secure,
      email: stored.email,
      username: stored.username,
      enabled: stored.enabled,
      intervalMinutes: stored.intervalMinutes,
      hasPassword: Boolean(stored.encryptedPassword),
      lastUid: stored.lastUid,
      lastSyncAt: stored.lastSyncAt,
      lastError: stored.lastError,
    };
  };

  const writeStored = async (next: StoredSettings): Promise<void> => {
    const temporaryPath = join(dirname(settingsPath), `.${randomUUID()}.email-settings.tmp`);
    await mkdir(dirname(settingsPath), { recursive: true });
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(next), 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporaryPath, settingsPath);
    } catch {
      if (handle !== null) await handle.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw serviceError('EMAIL_SETTINGS_UNAVAILABLE', '邮箱配置无法安全写入本机');
    }
  };

  const readPassword = async (stored: StoredSettings): Promise<string> => {
    try {
      const password = await decrypt(Buffer.from(stored.encryptedPassword, 'base64'));
      if (password.length === 0) throw new Error('empty password');
      return password;
    } catch (error) {
      if (error instanceof EmailSettingsError) throw error;
      throw serviceError('EMAIL_SETTINGS_UNAVAILABLE', '本机无法解密已保存的邮箱密码');
    }
  };

  return {
    async getPublic() {
      return publicValue(await readStored());
    },

    async getPrivate() {
      const stored = await readStored();
      if (stored === null) throw serviceError('EMAIL_NOT_CONFIGURED', '尚未配置邮箱同步');
      return {
        ...publicValue(stored),
        password: await readPassword(stored),
      };
    },

    async save(input) {
      let parsed: EmailSettingsSaveInput;
      try {
        parsed = emailSettingsSaveSchema.parse(input);
      } catch (error) {
        if (error instanceof ZodError) throw serviceError('VALIDATION_ERROR', '邮箱配置格式无效');
        throw error;
      }
      const previous = await readStored();
      const replacementPassword = parsed.password.trim().length > 0 ? parsed.password : null;
      const identityChanged = previous !== null && (
        previous.host !== parsed.host
        || previous.port !== parsed.port
        || previous.secure !== parsed.secure
        || previous.email !== parsed.email
        || previous.username !== parsed.username
      );
      if (previous === null && replacementPassword === null) {
        throw serviceError('EMAIL_NOT_CONFIGURED', '首次保存邮箱配置时需要填写密码');
      }
      if (replacementPassword === null && identityChanged) {
        throw serviceError('EMAIL_NOT_CONFIGURED', '更换邮箱服务器或地址时需要填写新密码');
      }

      let encryptedPassword = previous?.encryptedPassword ?? '';
      if (replacementPassword !== null) {
        try {
          encryptedPassword = (await encrypt(replacementPassword)).toString('base64');
        } catch {
          throw serviceError('EMAIL_SETTINGS_UNAVAILABLE', '本机安全存储暂时不可用');
        }
      } else if (previous !== null) {
        await readPassword(previous);
      }
      if (encryptedPassword.length === 0) {
        throw serviceError('EMAIL_NOT_CONFIGURED', '尚未配置邮箱密码');
      }

      const next: StoredSettings = {
        version: 1,
        host: parsed.host,
        port: parsed.port,
        secure: parsed.secure,
        email: parsed.email,
        username: parsed.username,
        encryptedPassword,
        enabled: parsed.enabled,
        intervalMinutes: parsed.intervalMinutes,
        lastUid: identityChanged ? 0 : previous?.lastUid ?? 0,
        lastSyncAt: identityChanged ? null : previous?.lastSyncAt ?? null,
        lastError: identityChanged ? null : previous?.lastError ?? null,
      };
      await writeStored(next);
      return publicValue(next);
    },

    async updateSyncState(state) {
      const stored = await readStored();
      if (stored === null) throw serviceError('EMAIL_NOT_CONFIGURED', '尚未配置邮箱同步');
      const next = { ...stored, ...state };
      await writeStored(next);
      return publicValue(next);
    },
  };
}
