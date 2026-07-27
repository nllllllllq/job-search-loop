import { CHANNELS } from '../../shared/ipc';
import {
  idSchema,
  preparationGenerateSchema,
  positionInputSchema,
  positionListFilterSchema,
  positionUpdateSchema,
  processStageSaveSchema,
  reorderStagesSchema,
  preparationMaterialListSchema,
  preparationMaterialSchema,
} from '../../shared/schemas';
import type { PositionsRepository } from '../repositories/positions';
import type { PreparationsRepository } from '../repositories/preparations';
import { safeIpcHandler, type IpcMainRegistrar } from './common';
import type { PreparationService } from '../services/preparation';

export function registerPositionHandlers(
  ipcMain: IpcMainRegistrar,
  positions: PositionsRepository,
): void {
  ipcMain.handle(CHANNELS.positions.list, safeIpcHandler((_event, payload) => (
    positions.list(positionListFilterSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.positions.get, safeIpcHandler((_event, payload) => (
    positions.getDetail(idSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.positions.create, safeIpcHandler((_event, payload) => (
    positions.create(positionInputSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.positions.update, safeIpcHandler((_event, payload) => {
    const parsed = positionUpdateSchema.parse(payload);
    return positions.update(parsed.id, parsed.input);
  }));
  ipcMain.handle(CHANNELS.positions.remove, safeIpcHandler((_event, payload) => (
    positions.remove(idSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.positions.saveStage, safeIpcHandler((_event, payload) => (
    positions.upsertStage(processStageSaveSchema.parse(payload))
  )));
  ipcMain.handle(CHANNELS.positions.reorderStages, safeIpcHandler((_event, payload) => {
    const parsed = reorderStagesSchema.parse(payload);
    return positions.reorderStages(parsed.positionId, parsed.orderedIds);
  }));
}

export function registerPreparationHandlers(
  ipcMain: IpcMainRegistrar,
  preparations: PreparationsRepository,
  service?: PreparationService,
): void {
  ipcMain.handle(CHANNELS.preparations.list, safeIpcHandler((_event, payload) => (
    preparationMaterialListSchema.parse(
      preparations.listByPosition(idSchema.parse(payload)),
    )
  )));
  ipcMain.handle(CHANNELS.preparations.get, safeIpcHandler((_event, payload) => (
    preparationMaterialSchema.parse(preparations.get(idSchema.parse(payload)))
  )));
  if (service) {
    ipcMain.handle(CHANNELS.preparations.generate, safeIpcHandler(async (_event, payload) => (
      preparationMaterialSchema.parse(
        await service.generate(preparationGenerateSchema.parse(payload)),
      )
    )));
  }
}
