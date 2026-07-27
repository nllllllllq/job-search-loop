import { CHANNELS } from '../../shared/ipc';
import {
  capabilityAnalysisPreviewSchema,
  capabilityAnalysisSelectionSchema,
  changeProposalListSchema,
  dashboardSummarySchema,
  idSchema,
  noPayloadSchema,
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
        changeProposalListSchema.parse(
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
        noPayloadSchema.parse(payload);
        const path = await runtime.dialogs.chooseRestorePath();
        if (path === null) return { status: 'cancelled' as const };
        await runtime.backup.restoreFrom(path);
        runtime.onRestoreCompleted();
        return { status: 'restored' as const };
      }),
    );
  }
}
