import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type AppError, type JobSearchApi } from '../shared/ipc';
import {
  aiConnectionResultSchema,
  aiPublicSettingsSchema,
  aiSettingsSaveSchema,
  preparationGenerateSchema,
  preparationMaterialListSchema,
  preparationMaterialSchema,
  promptKindSchema,
  promptSaveSchema,
  promptTemplateListSchema,
  promptTemplateSchema,
} from '../shared/schemas';

function parseAppError(value: unknown): AppError | null {
  if (value === null || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    ![
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'CONFLICT',
      'INTERNAL_ERROR',
      'AI_NOT_CONFIGURED',
      'AI_AUTH_FAILED',
      'AI_RATE_LIMITED',
      'AI_TIMEOUT',
      'AI_PROVIDER_ERROR',
      'AI_INVALID_OUTPUT',
      'AI_SETTINGS_CORRUPT',
      'AI_SETTINGS_UNAVAILABLE',
    ].includes(
      String(candidate.code),
    )
    || typeof candidate.message !== 'string'
  ) {
    return null;
  }
  return {
    code: candidate.code as AppError['code'],
    message: candidate.message,
  };
}

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  try {
    return await ipcRenderer.invoke(channel, payload) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const marker = 'JOB_SEARCH_ERROR:';
    const markerIndex = message.indexOf(marker);
    if (markerIndex >= 0) {
      try {
        const parsed = parseAppError(JSON.parse(message.slice(markerIndex + marker.length)));
        if (parsed !== null) throw parsed;
      } catch (parsedOrSyntaxError) {
        const parsed = parseAppError(parsedOrSyntaxError);
        if (parsed !== null) throw parsed;
      }
    }
    throw { code: 'INTERNAL_ERROR', message: 'The request could not be completed' } satisfies AppError;
  }
}

function frozen<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

const api = frozen<JobSearchApi>({
  version: '0.1.0',
  ai: frozen<JobSearchApi['ai']>({
    settings: frozen<JobSearchApi['ai']['settings']>({
      get: async () => aiPublicSettingsSchema.parse(
        await invoke(CHANNELS.ai.settings.get),
      ),
      save: async (input) => aiPublicSettingsSchema.parse(
        await invoke(
          CHANNELS.ai.settings.save,
          aiSettingsSaveSchema.parse(input),
        ),
      ),
    }),
    testConnection: async () => aiConnectionResultSchema.parse(
      await invoke(CHANNELS.ai.testConnection),
    ),
  }),
  positions: frozen<JobSearchApi['positions']>({
    list: (filter) => invoke(CHANNELS.positions.list, filter),
    get: (id) => invoke(CHANNELS.positions.get, id),
    create: (input) => invoke(CHANNELS.positions.create, input),
    update: (id, input) => invoke(CHANNELS.positions.update, { id, input }),
    remove: (id) => invoke(CHANNELS.positions.remove, id),
    saveStage: (input) => invoke(CHANNELS.positions.saveStage, input),
    reorderStages: (positionId, orderedIds) => invoke(
      CHANNELS.positions.reorderStages,
      { positionId, orderedIds },
    ),
  }),
  preparations: frozen<JobSearchApi['preparations']>({
    list: async (positionId) => preparationMaterialListSchema.parse(
      await invoke(CHANNELS.preparations.list, positionId),
    ),
    get: async (id) => preparationMaterialSchema.parse(
      await invoke(CHANNELS.preparations.get, id),
    ),
    generate: async (input) => preparationMaterialSchema.parse(
      await invoke(
        CHANNELS.preparations.generate,
        preparationGenerateSchema.parse(input),
      ),
    ),
  }),
  assets: frozen<JobSearchApi['assets']>({
    projects: frozen<JobSearchApi['assets']['projects']>({
      list: () => invoke(CHANNELS.assets.projects.list),
      get: (id) => invoke(CHANNELS.assets.projects.get, id),
      save: (input) => invoke(CHANNELS.assets.projects.save, input),
    }),
    questions: frozen<JobSearchApi['assets']['questions']>({
      list: (type) => invoke(CHANNELS.assets.questions.list, type ? { type } : undefined),
      get: (id) => invoke(CHANNELS.assets.questions.get, id),
      save: (input) => invoke(CHANNELS.assets.questions.save, input),
    }),
    capabilities: frozen<JobSearchApi['assets']['capabilities']>({
      list: () => invoke(CHANNELS.assets.capabilities.list),
      get: (id) => invoke(CHANNELS.assets.capabilities.get, id),
      save: (input) => invoke(CHANNELS.assets.capabilities.save, input),
    }),
    insights: frozen<JobSearchApi['assets']['insights']>({
      list: () => invoke(CHANNELS.assets.insights.list),
      get: (id) => invoke(CHANNELS.assets.insights.get, id),
      save: (input) => invoke(CHANNELS.assets.insights.save, input),
    }),
    versions: (type, id) => invoke(CHANNELS.assets.versions, { type, id }),
    prompts: frozen<JobSearchApi['assets']['prompts']>({
      list: async () => promptTemplateListSchema.parse(
        await invoke(CHANNELS.assets.prompts.list),
      ),
      get: async (kind) => promptTemplateSchema.parse(
        await invoke(
          CHANNELS.assets.prompts.get,
          promptKindSchema.parse(kind),
        ),
      ),
      save: async (kind, content) => promptTemplateSchema.parse(
        await invoke(
          CHANNELS.assets.prompts.save,
          promptSaveSchema.parse({ kind, content }),
        ),
      ),
    }),
  }),
  reviews: frozen<JobSearchApi['reviews']>({
    interviews: frozen<JobSearchApi['reviews']['interviews']>({
      create: (input) => invoke(CHANNELS.reviews.interviews.create, input),
      update: (id, input) => invoke(CHANNELS.reviews.interviews.update, { id, input }),
      get: (id) => invoke(CHANNELS.reviews.interviews.get, id),
      list: (positionId) => invoke(CHANNELS.reviews.interviews.list, positionId),
    }),
    proposals: frozen<JobSearchApi['reviews']['proposals']>({
      list: (status) => invoke(
        CHANNELS.reviews.proposals.list,
        status ? { status } : undefined,
      ),
      accept: (id, editedPayload) => invoke(
        CHANNELS.reviews.proposals.accept,
        { id, editedPayload },
      ),
      ignore: (id) => invoke(CHANNELS.reviews.proposals.ignore, id),
    }),
  }),
  system: frozen<JobSearchApi['system']>({
    getDashboardSummary: () => invoke(CHANNELS.system.getDashboardSummary),
  }),
});

contextBridge.exposeInMainWorld('jobSearch', api);
