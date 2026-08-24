import { CHANNELS } from '../../shared/ipc';
import {
  backupRestoreOptionsSchema,
  capabilityAnalysisOutputSchema,
  capabilityAnalysisPreviewSchema,
  capabilityAnalysisSelectionSchema,
  dashboardSummarySchema,
  idSchema,
  noPayloadSchema,
  rollbackCheckInputSchema,
  rollbackIdSchema,
} from '../../shared/schemas';
import type { DashboardRepository } from '../repositories/dashboard';
import type { CapabilityAnalysisService } from '../services/capability-analysis';
import type { BackupService } from '../services/backup';
import { safeIpcHandler, type IpcMainRegistrar } from './common';

export interface BackupDialogs {
  chooseExportPath(): Promise<string | null>;
  chooseRestorePath(): Promise<string | null>;
}

export interface SystemRuntime {
  backup: BackupService;
  dialogs: BackupDialogs;
  onRestoreCompleted(): void;
}

export function registerSystemHandlers(
  ipcMain: IpcMainRegistrar,
  dashboard: DashboardRepository,
  capabilityAnalysis?: CapabilityAnalysisService,
  runtime?: SystemRuntime,
): void {
  ipcMain.handle(
    CHANNELS.system.getDashboardSummary,
    safeIpcHandler((_event, payload) => {
      noPayloadSchema.parse(payload);
      return dashboardSummarySchema.parse(dashboard.getSummary());
    }),
  );
  if (capabilityAnalysis) {
    ipcMain.handle(
      CHANNELS.system.previewCapabilityAnalysis,
      safeIpcHandler(async (_event, payload) => (
        capabilityAnalysisPreviewSchema.parse(
          await capabilityAnalysis.preview(
            capabilityAnalysisSelectionSchema.parse(payload),
          ),
        )
      )),
    );
    ipcMain.handle(
      CHANNELS.system.confirmCapabilityAnalysis,
      safeIpcHandler(async (_event, payload) => (
        capabilityAnalysisOutputSchema.parse(
          await capabilityAnalysis.confirm(idSchema.parse(payload)),
        )
      )),
    );
  }
  if (runtime) {
    ipcMain.handle(
      CHANNELS.system.exportBackup,
      safeIpcHandler(async (_event, payload) => {
        noPayloadSchema.parse(payload);
        const path = await runtime.dialogs.chooseExportPath();
        if (path === null) return { status: 'cancelled' as const };
        await runtime.backup.exportTo(path);
        return { status: 'exported' as const };
      }),
    );
    ipcMain.handle(
      CHANNELS.system.restoreBackup,
      safeIpcHandler(async (_event, payload) => {
        const options = backupRestoreOptionsSchema.parse(payload);
        const path = await runtime.dialogs.chooseRestorePath();
        if (path === null) return { status: 'cancelled' as const };
        const result = await runtime.backup.restoreFrom(path, options);
        if ('status' in result && result.status === 'cancelled') {
          return { status: 'cancelled' as const };
        }
        runtime.onRestoreCompleted();
        return { status: 'restored' as const };
      }),
    );
    ipcMain.handle(
      CHANNELS.system.getBackupProgress,
      safeIpcHandler((_event, payload) => {
        noPayloadSchema.parse(payload);
        return runtime.backup.getProgress();
      }),
    );
    ipcMain.handle(
      CHANNELS.system.cancelBackup,
      safeIpcHandler((_event, payload) => {
        noPayloadSchema.parse(payload);
        return {
          status: runtime.backup.cancel()
            ? 'cancelled' as const
            : 'not-cancellable' as const,
        };
      }),
    );
    ipcMain.handle(
      CHANNELS.system.listRollbacks,
      safeIpcHandler((_event, payload) => {
        noPayloadSchema.parse(payload);
        return runtime.backup.listRollbacks();
      }),
    );
    ipcMain.handle(
      CHANNELS.system.checkRollback,
      safeIpcHandler((_event, payload) => {
        const input = rollbackCheckInputSchema.parse(payload);
        return runtime.backup.checkRollback(input.id, input.deep);
      }),
    );
    ipcMain.handle(
      CHANNELS.system.deleteRollback,
      safeIpcHandler(async (_event, payload) => {
        await runtime.backup.deleteRollback(rollbackIdSchema.parse(payload));
      }),
    );
  }
}
