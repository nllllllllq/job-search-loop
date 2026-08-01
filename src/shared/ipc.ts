import type {
  AiTask,
  AiConnectionResult,
  AiPublicSettings,
  AiSettingsSaveInput,
  AssetVersion,
  CanonicalStage,
  Capability,
  CapabilityMergeResult,
  CapabilityAnalysisPreview,
  CapabilityInput,
  ChangeProposal,
  ChangeProposalListResult,
  DashboardSummary,
  Insight,
  InsightInput,
  Interview,
  InterviewReviewPreview,
  InterviewReviewPreviewInput,
  InterviewReviewResult,
  ImportedFileInput,
  ImportedImageInput,
  Position,
  PositionDetail,
  PositionInput,
  PositionImportPreview,
  ProjectImportPreview,
  ProjectSegmentUpdate,
  PreparationGenerateInput,
  PreparationOutboundPreview,
  PositionListItem,
  PreparationMaterial,
  ProcessStage,
  ProcessStageInput,
  Project,
  ProjectInput,
  PromptKind,
  PromptTemplate,
  ProposalStatus,
  ProposalTarget,
  Question,
  QuestionInput,
  QuestionType,
} from './domain';
export type InterviewEditInput = Omit<
  Interview,
  'id' | 'summary' | 'reviewSnapshot' | 'createdAt' | 'updatedAt'
>;

export const CHANNELS = {
  ai: {
    settings: {
      get: 'ai:settings:get',
      save: 'ai:settings:save',
    },
    testConnection: 'ai:test-connection',
  },
  positions: {
    list: 'positions:list',
    get: 'positions:get',
    create: 'positions:create',
    update: 'positions:update',
    remove: 'positions:remove',
    saveStage: 'positions:save-stage',
    reorderStages: 'positions:reorder-stages',
    removeStage: 'positions:remove-stage',
  },
  preparations: {
    list: 'preparations:list',
    get: 'preparations:get',
    preview: 'preparations:preview',
    generate: 'preparations:generate',
    start: 'preparations:start',
  },
  tasks: {
    listByPosition: 'tasks:list-by-position',
    get: 'tasks:get',
  },
  assets: {
    projects: { list: 'assets:projects:list', get: 'assets:projects:get', save: 'assets:projects:save' },
    questions: { list: 'assets:questions:list', get: 'assets:questions:get', save: 'assets:questions:save' },
    capabilities: {
      list: 'assets:capabilities:list',
      get: 'assets:capabilities:get',
      save: 'assets:capabilities:save',
      merge: 'assets:capabilities:merge',
    },
    insights: { list: 'assets:insights:list', get: 'assets:insights:get', save: 'assets:insights:save' },
    versions: 'assets:versions:list',
    prompts: { list: 'assets:prompts:list', get: 'assets:prompts:get', save: 'assets:prompts:save' },
  },
  reviews: {
    interviews: {
      create: 'reviews:interviews:create',
      update: 'reviews:interviews:update',
      get: 'reviews:interviews:get',
      list: 'reviews:interviews:list',
    },
    review: {
      preview: 'reviews:review:preview',
      confirm: 'reviews:review:confirm',
      cancelPreview: 'reviews:review:cancel-preview',
    },
    proposals: {
      list: 'reviews:proposals:list',
      accept: 'reviews:proposals:accept',
      ignore: 'reviews:proposals:ignore',
    },
  },
  system: {
    getDashboardSummary: 'system:dashboard-summary',
    previewCapabilityAnalysis: 'system:capability-analysis:preview',
    confirmCapabilityAnalysis: 'system:capability-analysis:confirm',
    exportBackup: 'system:backup:export',
    restoreBackup: 'system:backup:restore',
    getBackupProgress: 'system:backup:progress',
    cancelBackup: 'system:backup:cancel',
    listRollbacks: 'system:backup:rollbacks:list',
    checkRollback: 'system:backup:rollbacks:check',
    deleteRollback: 'system:backup:rollbacks:delete',
  },
  imports: {
    previewPositionFromText: 'imports:position:text',
    previewPositionFromImages: 'imports:position:images',
    previewProjectsFromDocument: 'imports:projects:document',
    updateProjectSegments: 'imports:projects:update-segments',
    cancel: 'imports:cancel',
  },
} as const;

export type BackupActionResult =
  | { status: 'cancelled' }
  | { status: 'exported' }
  | { status: 'restored' };

export type BackupProgress = {
  operation: 'idle' | 'export' | 'restore' | 'deep-check';
  phase: string;
  percent: number;
  cancellable: boolean;
  active: boolean;
};

export type RollbackSummary = {
  id: string;
  label: string;
  createdAt: string;
  size: number;
  quickStatus: 'valid';
  deepStatus: 'unchecked' | 'valid';
};

export interface AppError {
  code:
    | 'VALIDATION_ERROR'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'INTERNAL_ERROR'
    | 'AI_NOT_CONFIGURED'
    | 'AI_AUTH_FAILED'
    | 'AI_RATE_LIMITED'
    | 'AI_TIMEOUT'
    | 'AI_PROVIDER_ERROR'
    | 'AI_INVALID_OUTPUT'
    | 'AI_SETTINGS_CORRUPT'
    | 'AI_SETTINGS_UNAVAILABLE'
    | 'BACKUP_INVALID'
    | 'BACKUP_FAILED';
  message: string;
  providerMessage?: string;
  httpStatus?: number;
  requestId?: string;
}

export interface JobSearchApi {
  readonly version: '0.1.0';
  readonly ai: {
    readonly settings: {
      get(): Promise<AiPublicSettings>;
      save(input: AiSettingsSaveInput): Promise<AiPublicSettings>;
    };
    testConnection(): Promise<AiConnectionResult>;
  };
  readonly positions: {
    list(filter?: { query?: string; stage?: CanonicalStage }): Promise<PositionListItem[]>;
    get(id: string): Promise<PositionDetail>;
    create(input: PositionInput): Promise<Position>;
    update(id: string, input: PositionInput): Promise<Position>;
    remove(id: string): Promise<void>;
    saveStage(input: ProcessStageInput & { id?: string }): Promise<ProcessStage>;
    reorderStages(positionId: string, orderedIds: string[]): Promise<ProcessStage[]>;
    removeStage(positionId: string, stageId: string): Promise<ProcessStage[]>;
  };
  readonly preparations: {
    list(positionId: string): Promise<PreparationMaterial[]>;
    get(id: string): Promise<PreparationMaterial>;
    preview(input: PreparationGenerateInput): Promise<PreparationOutboundPreview>;
    generate(input: PreparationGenerateInput): Promise<PreparationMaterial>;
    start(input: PreparationGenerateInput): Promise<AiTask>;
  };
  readonly tasks: {
    listByPosition(positionId: string): Promise<AiTask[]>;
    get(id: string): Promise<AiTask>;
  };
  readonly assets: {
    readonly projects: {
      list(): Promise<Project[]>;
      get(id: string): Promise<Project>;
      save(input: ProjectInput & { id?: string }): Promise<Project>;
    };
    readonly questions: {
      list(type?: QuestionType): Promise<Question[]>;
      get(id: string): Promise<Question>;
      save(input: QuestionInput & { id?: string }): Promise<Question>;
    };
    readonly capabilities: {
      list(): Promise<Capability[]>;
      get(id: string): Promise<Capability>;
      save(input: CapabilityInput & { id?: string }): Promise<Capability>;
      merge(sourceId: string, targetId: string): Promise<CapabilityMergeResult>;
    };
    readonly insights: {
      list(): Promise<Insight[]>;
      get(id: string): Promise<Insight>;
      save(input: InsightInput & { id?: string }): Promise<Insight>;
    };
    versions(type: ProposalTarget, id: string): Promise<AssetVersion[]>;
    readonly prompts: {
      list(): Promise<PromptTemplate[]>;
      get(kind: PromptKind): Promise<PromptTemplate>;
      save(kind: PromptKind, content: string): Promise<PromptTemplate>;
    };
  };
  readonly reviews: {
    readonly interviews: {
      create(input: InterviewEditInput): Promise<Interview>;
      update(id: string, input: InterviewEditInput): Promise<Interview>;
      get(id: string): Promise<Interview>;
      list(positionId: string): Promise<Interview[]>;
    };
    readonly review: {
      preview(input: InterviewReviewPreviewInput): Promise<InterviewReviewPreview>;
      confirm(token: string): Promise<InterviewReviewResult>;
      cancelPreview(token: string): Promise<void>;
    };
    readonly proposals: {
      list(status?: ProposalStatus): Promise<ChangeProposalListResult>;
      accept(id: string, editedPayload?: unknown): Promise<ChangeProposal>;
      ignore(id: string): Promise<ChangeProposal>;
    };
  };
  readonly imports: {
    previewPositionFromText(text: string): Promise<PositionImportPreview>;
    previewPositionFromImages(images: ImportedImageInput[]): Promise<PositionImportPreview>;
    previewProjectsFromDocument(
      file: ImportedFileInput,
      mode: 'ai' | 'local',
    ): Promise<ProjectImportPreview>;
    updateProjectSegments(
      sessionId: string,
      operation: ProjectSegmentUpdate,
    ): Promise<ProjectImportPreview>;
    cancel(sessionId: string): Promise<void>;
  };
  readonly system: {
    getDashboardSummary(): Promise<DashboardSummary>;
    previewCapabilityAnalysis(positionIds: string[]): Promise<CapabilityAnalysisPreview>;
    confirmCapabilityAnalysis(token: string): Promise<ChangeProposal[]>;
    exportBackup(): Promise<BackupActionResult>;
    restoreBackup(options?: { deepCheck?: boolean }): Promise<BackupActionResult>;
    getBackupProgress(): Promise<BackupProgress>;
    cancelBackup(): Promise<{ status: 'cancelled' | 'not-cancellable' }>;
    listRollbacks(): Promise<RollbackSummary[]>;
    checkRollback(id: string, deep: boolean): Promise<RollbackSummary>;
    deleteRollback(id: string): Promise<void>;
  };
}
