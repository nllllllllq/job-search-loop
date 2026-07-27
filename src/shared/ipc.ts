import type {
  AiConnectionResult,
  AiPublicSettings,
  AiSettingsSaveInput,
  AssetVersion,
  CanonicalStage,
  Capability,
  CapabilityInput,
  ChangeProposal,
  DashboardSummary,
  Insight,
  InsightInput,
  Interview,
  Position,
  PositionDetail,
  PositionInput,
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
export type PreparationCreateInput = Omit<PreparationMaterial, 'id' | 'createdAt'>;
export type InterviewEditInput = Omit<
  Interview,
  'id' | 'summary' | 'createdAt' | 'updatedAt'
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
  },
  preparations: {
    list: 'preparations:list',
    get: 'preparations:get',
    create: 'preparations:create',
  },
  assets: {
    projects: { list: 'assets:projects:list', get: 'assets:projects:get', save: 'assets:projects:save' },
    questions: { list: 'assets:questions:list', get: 'assets:questions:get', save: 'assets:questions:save' },
    capabilities: { list: 'assets:capabilities:list', get: 'assets:capabilities:get', save: 'assets:capabilities:save' },
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
    proposals: {
      list: 'reviews:proposals:list',
      accept: 'reviews:proposals:accept',
      ignore: 'reviews:proposals:ignore',
    },
  },
  system: {
    getDashboardSummary: 'system:dashboard-summary',
  },
} as const;

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
    | 'AI_SETTINGS_UNAVAILABLE';
  message: string;
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
  };
  readonly preparations: {
    list(positionId: string): Promise<PreparationMaterial[]>;
    get(id: string): Promise<PreparationMaterial>;
    create(input: PreparationCreateInput): Promise<PreparationMaterial>;
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
    readonly proposals: {
      list(status?: ProposalStatus): Promise<ChangeProposal[]>;
      accept(id: string, editedPayload: unknown): Promise<ChangeProposal>;
      ignore(id: string): Promise<ChangeProposal>;
    };
  };
  readonly system: {
    getDashboardSummary(): Promise<DashboardSummary>;
  };
}
