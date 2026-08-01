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
  createCompanyAliasesRepository,
  type CompanyAliasesRepository,
} from '../repositories/company-aliases';
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
import {
  createAiTasksRepository,
  type AiTasksRepository,
} from '../repositories/ai-tasks';
import { registerAssetHandlers } from './assets';
import { registerAiHandlers } from './ai';
import { registerPositionHandlers, registerPreparationHandlers } from './positions';
import { registerReviewHandlers } from './reviews';
import { registerSystemHandlers } from './system';
import { registerImportHandlers, type ImportRuntime } from './imports';
import { registerPreparationTaskHandlers } from './tasks';
import { SafeIpcError, type IpcMainRegistrar } from './common';
import type { AiClient } from '../services/ai-client';
import type { AiSettingsStore } from '../services/ai-settings';
import { createPreparationService } from '../services/preparation';
import { createPreparationTaskRuntime } from '../services/preparation-tasks';
import { createInterviewReviewService } from '../services/interview-review';
import { createCapabilityAnalysisService } from '../services/capability-analysis';
import type { SystemRuntime } from './system';

export type { IpcMainRegistrar } from './common';

export interface RepositoryBundle {
  positions: PositionsRepository;
  companyAliases?: CompanyAliasesRepository;
  preparations: PreparationsRepository;
  interviews: InterviewsRepository;
  assets: AssetsRepository;
  prompts: PromptsRepository;
  proposals: ProposalsRepository;
  dashboard: DashboardRepository;
  aiTasks: AiTasksRepository;
}

export interface AiRuntime {
  settings: AiSettingsStore;
  client: Pick<AiClient, 'testConnection' | 'completeJson'>;
}

export interface MainRuntime {
  system?: SystemRuntime;
  imports?: ImportRuntime;
  isBlocked?: () => boolean;
}

export function createRepositoryBundle(db: DatabaseSync): RepositoryBundle {
  return {
    positions: createPositionsRepository(db),
    companyAliases: createCompanyAliasesRepository(db),
    preparations: createPreparationsRepository(db),
    interviews: createInterviewsRepository(db),
    assets: createAssetsRepository(db),
    prompts: createPromptsRepository(db),
    proposals: createProposalsRepository(db),
    dashboard: createDashboardRepository(db),
    aiTasks: createAiTasksRepository(db),
  };
}

export function registerIpcHandlers(
  ipcMain: IpcMainRegistrar,
  repositories: RepositoryBundle,
  ai?: AiRuntime,
  runtime?: MainRuntime,
): void {
  const guardedIpcMain: IpcMainRegistrar = runtime?.isBlocked
    ? {
      handle(channel, handler) {
        ipcMain.handle(channel, async (event, payload) => {
          if (runtime.isBlocked?.()) {
            throw new SafeIpcError(
              'CONFLICT',
              '应用正在完成数据恢复并准备重启。',
            );
          }
          return handler(event, payload);
        });
      },
    }
    : ipcMain;
  const {
    positions,
    companyAliases,
    preparations,
    assets,
    prompts,
    interviews,
    proposals,
    dashboard,
    aiTasks,
  } = repositories;

  registerPositionHandlers(guardedIpcMain, positions, companyAliases);
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
  registerPreparationHandlers(guardedIpcMain, preparations, preparationService);
  if (preparationService !== undefined) {
    registerPreparationTaskHandlers(
      guardedIpcMain,
      createPreparationTaskRuntime({ tasks: aiTasks, preparation: preparationService }),
    );
  }
  registerAssetHandlers(guardedIpcMain, assets, prompts);
  const reviewService = ai
    ? createInterviewReviewService({
      positions,
      interviews,
      assets,
      prompts,
      proposals,
      ai: ai.client,
      getSettings: () => ai.settings.getPrivate(),
    })
    : undefined;
  registerReviewHandlers(guardedIpcMain, interviews, proposals, reviewService);
  const capabilityAnalysisService = ai
    ? createCapabilityAnalysisService({
      positions,
      prompts,
      proposals,
      ai: ai.client,
      getSettings: () => ai.settings.getPrivate(),
    })
    : undefined;
  registerSystemHandlers(
    guardedIpcMain,
    dashboard,
    capabilityAnalysisService,
    runtime?.system,
  );
  registerImportHandlers(guardedIpcMain, {
    ...(ai ? {
      ai: ai.client,
      getSettings: () => ai.settings.getPrivate(),
      prompts,
    } : {}),
    ...runtime?.imports,
  });
  if (ai) registerAiHandlers(guardedIpcMain, ai.settings, ai.client);
}
