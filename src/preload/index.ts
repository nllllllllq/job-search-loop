import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type AppError, type JobSearchApi } from '../shared/ipc';
import {
  aiConnectionResultSchema,
  aiPublicSettingsSchema,
  aiSettingsSaveSchema,
  backupActionResultSchema,
  backupCancelResultSchema,
  backupProgressSchema,
  backupRestoreOptionsSchema,
  capabilityAnalysisPreviewSchema,
  capabilityMergeResultSchema,
  capabilityMergeSchema,
  capabilityAnalysisSelectionSchema,
  changeProposalArraySchema,
  changeProposalListSchema,
  dashboardSummarySchema,
  changeProposalSchema,
  idSchema,
  interviewInputSchema,
  interviewListSchema,
  interviewReviewPreviewSchema,
  interviewReviewPreviewInputSchema,
  interviewReviewResultSchema,
  interviewSchema,
  interviewUpdateSchema,
  importCancelSchema,
  positionImportImagesSchema,
  positionImportTextSchema,
  projectImportDocumentSchema,
  projectSegmentsUpdateSchema,
  preparationGenerateSchema,
  preparationMaterialListSchema,
  preparationOutboundPreviewSchema,
  preparationReadableMaterialSchema,
  promptKindSchema,
  promptSaveSchema,
  promptTemplateListSchema,
  promptTemplateSchema,
  rollbackCheckInputSchema,
  rollbackIdSchema,
  rollbackSummaryArraySchema,
  rollbackSummarySchema,
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
      'BACKUP_INVALID',
      'BACKUP_FAILED',
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
      await invoke(CHANNELS.preparations.list, idSchema.parse(positionId)),
    ),
    get: async (id) => preparationReadableMaterialSchema.parse(
      await invoke(CHANNELS.preparations.get, idSchema.parse(id)),
    ),
    preview: async (input) => preparationOutboundPreviewSchema.parse(
      await invoke(
        CHANNELS.preparations.preview,
        preparationGenerateSchema.parse(input),
      ),
    ),
    generate: async (input) => preparationReadableMaterialSchema.parse(
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
      merge: async (sourceId, targetId) => capabilityMergeResultSchema.parse(
        await invoke(
          CHANNELS.assets.capabilities.merge,
          capabilityMergeSchema.parse({ sourceId, targetId }),
        ),
      ),
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
      create: async (input) => interviewSchema.parse(await invoke(
        CHANNELS.reviews.interviews.create,
        interviewInputSchema.parse(input),
      )),
      update: async (id, input) => interviewSchema.parse(await invoke(
        CHANNELS.reviews.interviews.update,
        { id: idSchema.parse(id), input: interviewUpdateSchema.parse(input) },
      )),
      get: async (id) => interviewSchema.parse(await invoke(
        CHANNELS.reviews.interviews.get,
        idSchema.parse(id),
      )),
      list: async (positionId) => interviewListSchema.parse(await invoke(
        CHANNELS.reviews.interviews.list,
        idSchema.parse(positionId),
      )),
    }),
    review: frozen<JobSearchApi['reviews']['review']>({
      preview: async (input) => interviewReviewPreviewSchema.parse(await invoke(
        CHANNELS.reviews.review.preview,
        interviewReviewPreviewInputSchema.parse(input),
      )),
      confirm: async (token) => interviewReviewResultSchema.parse(await invoke(
        CHANNELS.reviews.review.confirm,
        idSchema.parse(token),
      )),
      cancelPreview: async (token) => {
        await invoke(CHANNELS.reviews.review.cancelPreview, idSchema.parse(token));
      },
    }),
    proposals: frozen<JobSearchApi['reviews']['proposals']>({
      list: async (status) => changeProposalListSchema.parse(await invoke(
        CHANNELS.reviews.proposals.list,
        status ? { status } : undefined,
      )),
      accept: async (id, editedPayload) => changeProposalSchema.parse(await invoke(
        CHANNELS.reviews.proposals.accept,
        editedPayload === undefined
          ? { id: idSchema.parse(id) }
          : { id: idSchema.parse(id), editedPayload },
      )),
      ignore: async (id) => changeProposalSchema.parse(await invoke(
        CHANNELS.reviews.proposals.ignore,
        idSchema.parse(id),
      )),
    }),
  }),
  imports: frozen<JobSearchApi['imports']>({
    previewPositionFromText: (text) => invoke(
      CHANNELS.imports.previewPositionFromText,
      positionImportTextSchema.parse({ text }),
    ),
    previewPositionFromImages: (images) => invoke(
      CHANNELS.imports.previewPositionFromImages,
      positionImportImagesSchema.parse({ images }),
    ),
    previewProjectsFromDocument: (file, mode) => invoke(
      CHANNELS.imports.previewProjectsFromDocument,
      projectImportDocumentSchema.parse({ file, mode }),
    ),
    updateProjectSegments: (sessionId, operation) => invoke(
      CHANNELS.imports.updateProjectSegments,
      projectSegmentsUpdateSchema.parse({ sessionId, operation }),
    ),
    cancel: async (sessionId) => {
      await invoke(
        CHANNELS.imports.cancel,
        importCancelSchema.parse({ sessionId }),
      );
    },
  }),
  system: frozen<JobSearchApi['system']>({
    getDashboardSummary: async () => dashboardSummarySchema.parse(
      await invoke(CHANNELS.system.getDashboardSummary),
    ),
    previewCapabilityAnalysis: async (positionIds) => capabilityAnalysisPreviewSchema.parse(
      await invoke(
        CHANNELS.system.previewCapabilityAnalysis,
        capabilityAnalysisSelectionSchema.parse(positionIds),
      ),
    ),
    confirmCapabilityAnalysis: async (token) => changeProposalArraySchema.parse(
      await invoke(
        CHANNELS.system.confirmCapabilityAnalysis,
        idSchema.parse(token),
      ),
    ),
    exportBackup: async () => backupActionResultSchema.parse(
      await invoke(CHANNELS.system.exportBackup),
    ),
    restoreBackup: async (options) => backupActionResultSchema.parse(
      await invoke(
        CHANNELS.system.restoreBackup,
        backupRestoreOptionsSchema.parse(options),
      ),
    ),
    getBackupProgress: async () => backupProgressSchema.parse(
      await invoke(CHANNELS.system.getBackupProgress),
    ),
    cancelBackup: async () => backupCancelResultSchema.parse(
      await invoke(CHANNELS.system.cancelBackup),
    ),
    listRollbacks: async () => rollbackSummaryArraySchema.parse(
      await invoke(CHANNELS.system.listRollbacks),
    ),
    checkRollback: async (id, deep) => rollbackSummarySchema.parse(
      await invoke(
        CHANNELS.system.checkRollback,
        rollbackCheckInputSchema.parse({ id, deep }),
      ),
    ),
    deleteRollback: async (id) => {
      await invoke(
        CHANNELS.system.deleteRollback,
        rollbackIdSchema.parse(id),
      );
    },
  }),
});

contextBridge.exposeInMainWorld('jobSearch', api);
