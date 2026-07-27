import { CHANNELS } from '../../shared/ipc';
import {
  aiConnectionResultSchema,
  aiPublicSettingsSchema,
  aiSettingsSaveSchema,
  noPayloadSchema,
} from '../../shared/schemas';
import type { AiClient } from '../services/ai-client';
import type { AiSettingsStore } from '../services/ai-settings';
import { safeIpcHandler, type IpcMainRegistrar } from './common';

export function registerAiHandlers(
  ipcMain: IpcMainRegistrar,
  settings: AiSettingsStore,
  client: Pick<AiClient, 'testConnection'>,
): void {
  ipcMain.handle(CHANNELS.ai.settings.get, safeIpcHandler(async (_event, payload) => {
    noPayloadSchema.parse(payload);
    return aiPublicSettingsSchema.parse(await settings.getPublic());
  }));
  ipcMain.handle(CHANNELS.ai.settings.save, safeIpcHandler(async (_event, payload) => {
    const input = aiSettingsSaveSchema.parse(payload);
    return aiPublicSettingsSchema.parse(await settings.save(input));
  }));
  ipcMain.handle(CHANNELS.ai.testConnection, safeIpcHandler(async (_event, payload) => {
    noPayloadSchema.parse(payload);
    return aiConnectionResultSchema.parse(await client.testConnection());
  }));
}
