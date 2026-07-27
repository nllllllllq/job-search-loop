import { CHANNELS } from '../../shared/ipc';
import { noPayloadSchema } from '../../shared/schemas';
import type { DashboardRepository } from '../repositories/dashboard';
import { safeIpcHandler, type IpcMainRegistrar } from './common';

export function registerSystemHandlers(
  ipcMain: IpcMainRegistrar,
  dashboard: DashboardRepository,
): void {
  ipcMain.handle(
    CHANNELS.system.getDashboardSummary,
    safeIpcHandler((_event, payload) => {
      noPayloadSchema.parse(payload);
      return dashboard.getSummary();
    }),
  );
}
