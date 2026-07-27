import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import type {
  AiPublicSettings,
  AiSettingsSaveInput,
} from '../../shared/domain';
import { aiBaseUrlSchema, aiSettingsSaveSchema } from '../../shared/schemas';
import type { AppError } from '../../shared/ipc';

const storedSettingsSchema = z.object({
  version: z.literal(1),
  baseUrl: aiBaseUrlSchema,
  model: z.string().trim().min(1).max(500),
  encryptedApiKey: z.string().min(1).regex(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  ),
});

type AiSettingsErrorCode = Extract<
  AppError['code'],
  | 'VALIDATION_ERROR'
  | 'AI_NOT_CONFIGURED'
  | 'AI_SETTINGS_CORRUPT'
  | 'AI_SETTINGS_UNAVAILABLE'
>;

export class AiServiceError extends Error {
  constructor(
    public readonly code: AppError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

interface StoredSettings {
  version: 1;
  baseUrl: string;
  model: string;
  encryptedApiKey: string;
}

export interface PrivateAiSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface AiSettingsStore {
  getPublic(): Promise<AiPublicSettings>;
  getPrivate(): Promise<PrivateAiSettings>;
  save(input: AiSettingsSaveInput): Promise<AiPublicSettings>;
}

export interface AiSettingsDependencies {
  encrypt(value: string): Buffer | Promise<Buffer>;
  decrypt(value: Buffer): string | Promise<string>;
  settingsPath: string;
}

function serviceError(code: AiSettingsErrorCode, message: string): AiServiceError {
  return new AiServiceError(code, message);
}

export function createAiSettingsStore({
  encrypt,
  decrypt,
  settingsPath,
}: AiSettingsDependencies): AiSettingsStore {
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
      ) {
        return null;
      }
      throw serviceError(
        'AI_SETTINGS_CORRUPT',
        'AI 配置文件无法安全读取。',
      );
    }

    try {
      return storedSettingsSchema.parse(JSON.parse(content));
    } catch {
      throw serviceError(
        'AI_SETTINGS_CORRUPT',
        'AI 配置文件已损坏，请重新配置。',
      );
    }
  };

  const publicValue = (stored: StoredSettings | null): AiPublicSettings => ({
    baseUrl: stored?.baseUrl ?? '',
    model: stored?.model ?? '',
    hasApiKey: Boolean(stored?.encryptedApiKey),
  });

  return {
    async getPublic() {
      return publicValue(await readStored());
    },

    async getPrivate() {
      const stored = await readStored();
      if (stored === null) {
        throw serviceError('AI_NOT_CONFIGURED', '尚未配置外部 AI。');
      }

      let apiKey: string;
      try {
        apiKey = await decrypt(Buffer.from(stored.encryptedApiKey, 'base64'));
      } catch {
        throw serviceError(
          'AI_SETTINGS_UNAVAILABLE',
          '本机无法解密已保存的 API Key。',
        );
      }
      if (apiKey.length === 0) {
        throw serviceError('AI_NOT_CONFIGURED', '尚未配置 API Key。');
      }
      return {
        baseUrl: stored.baseUrl,
        model: stored.model,
        apiKey,
      };
    },

    async save(input) {
      let parsed: AiSettingsSaveInput;
      try {
        parsed = aiSettingsSaveSchema.parse(input);
      } catch (error) {
        if (error instanceof ZodError) {
          throw serviceError('VALIDATION_ERROR', 'AI 配置格式无效。');
        }
        throw error;
      }

      const replacementKey = parsed.apiKey.trim().length > 0
        ? parsed.apiKey
        : null;
      let previous: StoredSettings | null;
      try {
        previous = await readStored();
      } catch (error) {
        if (
          error instanceof AiServiceError
          && error.code === 'AI_SETTINGS_CORRUPT'
          && replacementKey !== null
        ) {
          previous = null;
        } else {
          throw error;
        }
      }
      if (replacementKey === null && previous === null) {
        throw serviceError('AI_NOT_CONFIGURED', '首次保存时需要填写 API Key。');
      }
      if (
        replacementKey === null
        && previous !== null
        && new URL(previous.baseUrl).origin !== new URL(parsed.baseUrl).origin
      ) {
        throw serviceError(
          'AI_NOT_CONFIGURED',
          '服务地址来源发生变化，请填写新的 API Key。',
        );
      }

      let encryptedApiKey = previous?.encryptedApiKey ?? '';
      if (replacementKey !== null) {
        try {
          encryptedApiKey = (await encrypt(replacementKey)).toString('base64');
        } catch {
          throw serviceError(
            'AI_SETTINGS_UNAVAILABLE',
            '本机安全存储暂时不可用。',
          );
        }
      }
      if (encryptedApiKey.length === 0) {
        throw serviceError('AI_NOT_CONFIGURED', '尚未配置 API Key。');
      }

      const next: StoredSettings = {
        version: 1,
        baseUrl: parsed.baseUrl,
        model: parsed.model,
        encryptedApiKey,
      };
      const directory = dirname(settingsPath);
      const temporaryPath = join(
        directory,
        `.${randomUUID()}.ai-settings.tmp`,
      );

      await mkdir(directory, { recursive: true });
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
        throw serviceError(
          'AI_SETTINGS_UNAVAILABLE',
          'AI 配置无法安全写入本机。',
        );
      }
      return publicValue(next);
    },
  };
}
