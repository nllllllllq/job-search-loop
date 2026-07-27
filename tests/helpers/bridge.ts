import { vi, type Mock } from 'vitest';
import type {
  Capability,
  ChangeProposal,
  DashboardSummary,
  Insight,
  Interview,
  Position,
  PositionDetail,
  PositionListItem,
  PreparationMaterial,
  ProcessStage,
  Project,
  PromptTemplate,
  Question,
} from '../../src/shared/domain';
import type { JobSearchApi } from '../../src/shared/ipc';

type ApiMock<T extends (...args: never[]) => unknown> = Mock<T>;

export interface JobSearchApiFake {
  readonly version: '0.1.0';
  readonly ai: {
    readonly settings: {
      get: ApiMock<JobSearchApi['ai']['settings']['get']>;
      save: ApiMock<JobSearchApi['ai']['settings']['save']>;
    };
    testConnection: ApiMock<JobSearchApi['ai']['testConnection']>;
  };
  readonly positions: {
    list: ApiMock<JobSearchApi['positions']['list']>;
    get: ApiMock<JobSearchApi['positions']['get']>;
    create: ApiMock<JobSearchApi['positions']['create']>;
    update: ApiMock<JobSearchApi['positions']['update']>;
    remove: ApiMock<JobSearchApi['positions']['remove']>;
    saveStage: ApiMock<JobSearchApi['positions']['saveStage']>;
    reorderStages: ApiMock<JobSearchApi['positions']['reorderStages']>;
  };
  readonly preparations: {
    list: ApiMock<JobSearchApi['preparations']['list']>;
    get: ApiMock<JobSearchApi['preparations']['get']>;
    preview: ApiMock<JobSearchApi['preparations']['preview']>;
    generate: ApiMock<JobSearchApi['preparations']['generate']>;
  };
  readonly assets: {
    readonly projects: {
      list: ApiMock<JobSearchApi['assets']['projects']['list']>;
      get: ApiMock<JobSearchApi['assets']['projects']['get']>;
      save: ApiMock<JobSearchApi['assets']['projects']['save']>;
    };
    readonly questions: {
      list: ApiMock<JobSearchApi['assets']['questions']['list']>;
      get: ApiMock<JobSearchApi['assets']['questions']['get']>;
      save: ApiMock<JobSearchApi['assets']['questions']['save']>;
    };
    readonly capabilities: {
      list: ApiMock<JobSearchApi['assets']['capabilities']['list']>;
      get: ApiMock<JobSearchApi['assets']['capabilities']['get']>;
      save: ApiMock<JobSearchApi['assets']['capabilities']['save']>;
    };
    readonly insights: {
      list: ApiMock<JobSearchApi['assets']['insights']['list']>;
      get: ApiMock<JobSearchApi['assets']['insights']['get']>;
      save: ApiMock<JobSearchApi['assets']['insights']['save']>;
    };
    versions: ApiMock<JobSearchApi['assets']['versions']>;
    readonly prompts: {
      list: ApiMock<JobSearchApi['assets']['prompts']['list']>;
      get: ApiMock<JobSearchApi['assets']['prompts']['get']>;
      save: ApiMock<JobSearchApi['assets']['prompts']['save']>;
    };
  };
  readonly reviews: {
    readonly interviews: {
      create: ApiMock<JobSearchApi['reviews']['interviews']['create']>;
      update: ApiMock<JobSearchApi['reviews']['interviews']['update']>;
      get: ApiMock<JobSearchApi['reviews']['interviews']['get']>;
      list: ApiMock<JobSearchApi['reviews']['interviews']['list']>;
    };
    readonly review: {
      preview: ApiMock<JobSearchApi['reviews']['review']['preview']>;
      confirm: ApiMock<JobSearchApi['reviews']['review']['confirm']>;
      cancelPreview: ApiMock<JobSearchApi['reviews']['review']['cancelPreview']>;
    };
    readonly proposals: {
      list: ApiMock<JobSearchApi['reviews']['proposals']['list']>;
      accept: ApiMock<JobSearchApi['reviews']['proposals']['accept']>;
      ignore: ApiMock<JobSearchApi['reviews']['proposals']['ignore']>;
    };
  };
  readonly system: {
    getDashboardSummary: ApiMock<JobSearchApi['system']['getDashboardSummary']>;
  };
}

const emptyPosition: Position = {
  id: '11111111-1111-4111-8111-111111111111',
  company: '示例公司',
  title: '示例岗位',
  interest: 3,
  rawJd: '示例 JD',
  currentStage: 'interested',
  finalResult: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const emptyDetail: PositionDetail = {
  ...emptyPosition,
  stages: [],
  interviews: [],
};

const dashboardSummary: DashboardSummary = {
  totalPositions: 0,
  stageDistribution: [],
  positionsWithInterviews: 0,
  completedReviews: 0,
  pendingProposals: 0,
  processEvents: [],
  capabilityFrequency: [],
};

export function createJobSearchFake(): JobSearchApiFake {
  return {
    version: '0.1.0',
    ai: {
      settings: {
        get: vi.fn<JobSearchApi['ai']['settings']['get']>().mockResolvedValue({
          baseUrl: '',
          model: '',
          hasApiKey: false,
        }),
        save: vi.fn<JobSearchApi['ai']['settings']['save']>().mockRejectedValue(
          new Error('未设置 AI 配置'),
        ),
      },
      testConnection: vi.fn<JobSearchApi['ai']['testConnection']>().mockRejectedValue(
        new Error('未设置 AI 配置'),
      ),
    },
    positions: {
      list: vi.fn<JobSearchApi['positions']['list']>().mockResolvedValue([] as PositionListItem[]),
      get: vi.fn<JobSearchApi['positions']['get']>().mockResolvedValue(emptyDetail),
      create: vi.fn<JobSearchApi['positions']['create']>().mockResolvedValue(emptyPosition),
      update: vi.fn<JobSearchApi['positions']['update']>().mockResolvedValue(emptyPosition),
      remove: vi.fn<JobSearchApi['positions']['remove']>().mockResolvedValue(undefined),
      saveStage: vi.fn<JobSearchApi['positions']['saveStage']>().mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        positionId: emptyPosition.id,
        name: '面试',
        canonicalStage: 'interview',
        actualDate: null,
        expectedDate: null,
        feedback: '',
        notes: '',
        orderIndex: 0,
        createdAt: emptyPosition.createdAt,
        updatedAt: emptyPosition.updatedAt,
      } as ProcessStage),
      reorderStages: vi.fn<JobSearchApi['positions']['reorderStages']>().mockResolvedValue([]),
    },
    preparations: {
      list: vi.fn<JobSearchApi['preparations']['list']>().mockResolvedValue([] as PreparationMaterial[]),
      get: vi.fn<JobSearchApi['preparations']['get']>().mockRejectedValue(new Error('未设置准备材料')),
      preview: vi.fn<JobSearchApi['preparations']['preview']>().mockRejectedValue(new Error('未设置准备预览')),
      generate: vi.fn<JobSearchApi['preparations']['generate']>().mockRejectedValue(new Error('未设置准备材料')),
    },
    assets: {
      projects: {
        list: vi.fn<JobSearchApi['assets']['projects']['list']>().mockResolvedValue([] as Project[]),
        get: vi.fn<JobSearchApi['assets']['projects']['get']>().mockRejectedValue(new Error('未设置项目')),
        save: vi.fn<JobSearchApi['assets']['projects']['save']>().mockRejectedValue(new Error('未设置项目')),
      },
      questions: {
        list: vi.fn<JobSearchApi['assets']['questions']['list']>().mockResolvedValue([] as Question[]),
        get: vi.fn<JobSearchApi['assets']['questions']['get']>().mockRejectedValue(new Error('未设置问题')),
        save: vi.fn<JobSearchApi['assets']['questions']['save']>().mockRejectedValue(new Error('未设置问题')),
      },
      capabilities: {
        list: vi.fn<JobSearchApi['assets']['capabilities']['list']>().mockResolvedValue([] as Capability[]),
        get: vi.fn<JobSearchApi['assets']['capabilities']['get']>().mockRejectedValue(new Error('未设置能力')),
        save: vi.fn<JobSearchApi['assets']['capabilities']['save']>().mockRejectedValue(new Error('未设置能力')),
      },
      insights: {
        list: vi.fn<JobSearchApi['assets']['insights']['list']>().mockResolvedValue([] as Insight[]),
        get: vi.fn<JobSearchApi['assets']['insights']['get']>().mockRejectedValue(new Error('未设置心得')),
        save: vi.fn<JobSearchApi['assets']['insights']['save']>().mockRejectedValue(new Error('未设置心得')),
      },
      versions: vi.fn<JobSearchApi['assets']['versions']>().mockResolvedValue([]),
      prompts: {
        list: vi.fn<JobSearchApi['assets']['prompts']['list']>().mockResolvedValue([] as PromptTemplate[]),
        get: vi.fn<JobSearchApi['assets']['prompts']['get']>().mockRejectedValue(new Error('未设置提示词')),
        save: vi.fn<JobSearchApi['assets']['prompts']['save']>().mockRejectedValue(new Error('未设置提示词')),
      },
    },
    reviews: {
      interviews: {
        create: vi.fn<JobSearchApi['reviews']['interviews']['create']>().mockRejectedValue(new Error('未设置面试')),
        update: vi.fn<JobSearchApi['reviews']['interviews']['update']>().mockRejectedValue(new Error('未设置面试')),
        get: vi.fn<JobSearchApi['reviews']['interviews']['get']>().mockRejectedValue(new Error('未设置面试')),
        list: vi.fn<JobSearchApi['reviews']['interviews']['list']>().mockResolvedValue([] as Interview[]),
      },
      review: {
        preview: vi.fn<JobSearchApi['reviews']['review']['preview']>().mockRejectedValue(new Error('未设置复盘预览')),
        confirm: vi.fn<JobSearchApi['reviews']['review']['confirm']>().mockRejectedValue(new Error('未设置复盘确认')),
        cancelPreview: vi.fn<JobSearchApi['reviews']['review']['cancelPreview']>().mockResolvedValue(undefined),
      },
      proposals: {
        list: vi.fn<JobSearchApi['reviews']['proposals']['list']>().mockResolvedValue([] as ChangeProposal[]),
        accept: vi.fn<JobSearchApi['reviews']['proposals']['accept']>().mockRejectedValue(new Error('未设置建议')),
        ignore: vi.fn<JobSearchApi['reviews']['proposals']['ignore']>().mockRejectedValue(new Error('未设置建议')),
      },
    },
    system: {
      getDashboardSummary: vi.fn<JobSearchApi['system']['getDashboardSummary']>().mockResolvedValue(dashboardSummary),
    },
  };
}

export function installJobSearchFake(fake = createJobSearchFake()): JobSearchApiFake {
  Object.defineProperty(window, 'jobSearch', {
    configurable: true,
    value: fake satisfies JobSearchApi,
  });
  return fake;
}

export function resetJobSearchFake(): JobSearchApiFake {
  return installJobSearchFake(createJobSearchFake());
}
