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
import { safeIpcHandler, type IpcMainRegistrar } from './common';

export function registerSystemHandlers(
  ipcMain: IpcMainRegistrar,
  dashboard: DashboardRepository,
  capabilityAnalysis?: CapabilityAnalysisService,
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
}
