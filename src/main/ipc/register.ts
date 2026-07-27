import type { DatabaseSync } from 'node:sqlite';
import { createAssetsRepository } from '../repositories/assets';
import { createDashboardRepository } from '../repositories/dashboard';
import { createInterviewsRepository } from '../repositories/interviews';
import { createPositionsRepository } from '../repositories/positions';
import { createPreparationsRepository } from '../repositories/preparations';
import { createPromptsRepository } from '../repositories/prompts';
import { createProposalsRepository } from '../repositories/proposals';
import { registerAssetHandlers } from './assets';
import { registerPositionHandlers, registerPreparationHandlers } from './positions';
import { registerReviewHandlers } from './reviews';
import { registerSystemHandlers } from './system';
import type { IpcMainRegistrar } from './common';

export function registerIpcHandlers(ipcMain: IpcMainRegistrar, db: DatabaseSync): void {
  const positions = createPositionsRepository(db);
  const preparations = createPreparationsRepository(db);
  const assets = createAssetsRepository(db);
  const prompts = createPromptsRepository(db);
  const interviews = createInterviewsRepository(db);
  const proposals = createProposalsRepository(db);
  const dashboard = createDashboardRepository(db);

  registerPositionHandlers(ipcMain, positions);
  registerPreparationHandlers(ipcMain, preparations);
  registerAssetHandlers(ipcMain, assets, prompts);
  registerReviewHandlers(ipcMain, interviews, proposals);
  registerSystemHandlers(ipcMain, dashboard);
}
