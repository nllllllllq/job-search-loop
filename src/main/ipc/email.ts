import { CHANNELS } from '../../shared/ipc';
import type { EmailSettingsPublic } from '../../shared/domain';
import {
  emailConnectionResultSchema,
  emailListRecentSchema,
  emailSettingsPublicSchema,
  emailSettingsSaveSchema,
  emailSyncEventListSchema,
  emailSyncResultSchema,
  noPayloadSchema,
} from '../../shared/schemas';
import type { EmailSettingsStore } from '../services/email-settings';
import { EmailSettingsError } from '../services/email-settings';
import type { EmailSyncService } from '../services/email-sync';
import { SafeIpcError, safeIpcHandler, type IpcMainRegistrar } from './common';

export function registerEmailHandlers(
  ipcMain: IpcMainRegistrar,
  settings: EmailSettingsStore,
  sync: EmailSyncService,
  onSettingsSaved?: (publicSettings: EmailSettingsPublic) => void | Promise<void>,
): void {
  ipcMain.handle(CHANNELS.email.settings.get, safeIpcHandler(async (_event, payload) => {
    noPayloadSchema.parse(payload);
    return emailSettingsPublicSchema.parse(await settings.getPublic());
  }));
  ipcMain.handle(CHANNELS.email.settings.save, safeIpcHandler(async (_event, payload) => {
    const saved = emailSettingsPublicSchema.parse(await settings.save(emailSettingsSaveSchema.parse(payload)));
    await onSettingsSaved?.(saved);
    return saved;
  }));
  ipcMain.handle(CHANNELS.email.testConnection, safeIpcHandler(async (_event, payload) => {
    noPayloadSchema.parse(payload);
    let result: unknown;
    try {
      result = await sync.testConnection();
    } catch (error) {
      if (error instanceof EmailSettingsError || error instanceof SafeIpcError) throw error;
      throw new SafeIpcError(
        'EMAIL_CONNECTION_FAILED',
        '邮箱连接失败，请检查服务器、端口、用户名和密码',
      );
    }
    return emailConnectionResultSchema.parse(result);
  }));
  ipcMain.handle(CHANNELS.email.syncNow, safeIpcHandler(async (_event, payload) => {
    noPayloadSchema.parse(payload);
    return emailSyncResultSchema.parse(await sync.syncNow());
  }));
  ipcMain.handle(CHANNELS.email.listRecent, safeIpcHandler(async (_event, payload) => {
    const parsed = emailListRecentSchema.parse(payload);
    return emailSyncEventListSchema.parse(sync.listRecent(parsed?.limit ?? 50));
  }));
}
