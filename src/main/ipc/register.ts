import type { DatabaseSync } from 'node:sqlite';
import {
  createAssetsRepository,
  type AssetsRepository,
} from '../repositories/assets';
import {
  createDashboardRepository,
  type DashboardRepository,
} from '../repositories/dashboard';
import {
  createInterviewsRepository,
  type InterviewsRepository,
} from '../repositories/interviews';
import {
  createPositionsRepository,
  type PositionsRepository,
} from '../repositories/positions';
import {
  createPreparationsRepository,
  type PreparationsRepository,
} from '../repositories/preparations';
import {
  createPromptsRepository,
  type PromptsRepository,
} from '../repositories/prompts';
import {
  createProposalsRepository,
  type ProposalsRepository,
} from '../repositories/proposals';
import { registerAssetHandlers } from './assets';
import { registerAiHandlers } from './ai';
import { registerPositionHandlers, registerPreparationHandlers } from './positions';
import { registerReviewHandlers } from './reviews';
import { registerSystemHandlers } from './system';
import type { IpcMainRegistrar } from './common';
import type { AiClient } from '../services/ai-client';
import type { AiSettingsStore } from '../services/ai-settings';
import { createPreparationService } from '../services/preparation';

export type { IpcMainRegistrar } from './common';

export interface RepositoryBundle {
  positions: PositionsRepository;
  preparations: PreparationsRepository;
  interviews: InterviewsRepository;
  assets: AssetsRepository;
  prompts: PromptsRepository;
  proposals: ProposalsRepository;
  dashboard: DashboardRepository;
}

export interface AiRuntime {
  settings: AiSettingsStore;
  client: Pick<AiClient, 'testConnection' | 'completeJson'>;
}

export function createRepositoryBundle(db: DatabaseSync): RepositoryBundle {
  return {
    positions: createPositionsRepository(db),
    preparations: createPreparationsRepository(db),
    interviews: createInterviewsRepository(db),
    assets: createAssetsRepository(db),
    prompts: createPromptsRepository(db),
    proposals: createProposalsRepository(db),
    dashboard: createDashboardRepository(db),
  };
}

export function registerIpcHandlers(
  ipcMain: IpcMainRegistrar,
  repositories: RepositoryBundle,
  ai?: AiRuntime,
): void {
  const {
    positions,
    preparations,
    assets,
    prompts,
    interviews,
    proposals,
    dashboard,
  } = repositories;

  registerPositionHandlers(ipcMain, positions);
  const preparationService = ai
    ? createPreparationService({
      positions,
      assets,
      preparations,
      prompts,
      ai: ai.client,
      getSettings: () => ai.settings.getPrivate(),
    })
    : undefined;
  registerPreparationHandlers(ipcMain, preparations, preparationService);
  registerAssetHandlers(ipcMain, assets, prompts);
  registerReviewHandlers(ipcMain, interviews, proposals);
  registerSystemHandlers(ipcMain, dashboard);
  if (ai) registerAiHandlers(ipcMain, ai.settings, ai.client);
}
