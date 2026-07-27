import { z } from 'zod';

const canonicalStages = [
  'interested', 'applied', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn',
] as const;
const proposalStatuses = ['pending', 'accepted', 'ignored'] as const;
const proposalTargets = ['project', 'question', 'capability', 'insight'] as const;
const proposalOperations = ['create', 'update', 'merge'] as const;
const questionTypes = ['interviewer', 'candidate'] as const;
const promptKinds = ['preparation', 'interview-review', 'capability-analysis'] as const;

const interestSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const canonicalStageSchema = z.enum(canonicalStages);
export const proposalStatusSchema = z.enum(proposalStatuses);
export const proposalTargetSchema = z.enum(proposalTargets);
export const proposalOperationSchema = z.enum(proposalOperations);
export const questionTypeSchema = z.enum(questionTypes);
export const promptKindSchema = z.enum(promptKinds);
export const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须是 YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, '日期必须是实际存在的 YYYY-MM-DD 日期');

export const positionInputSchema = z.object({
  company: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  interest: interestSchema,
  rawJd: z.string()
    .min(1)
    .max(100_000)
    .refine((value) => value.trim().length > 0, '原始 JD 不能为空'),
});

export const processStageInputSchema = z.object({
  positionId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  canonicalStage: canonicalStageSchema,
  actualDate: isoDateSchema.nullable(),
  expectedDate: isoDateSchema.nullable(),
  feedback: z.string().max(20_000),
  notes: z.string().max(20_000),
  orderIndex: z.number().int().nonnegative(),
});

const projectPayloadObjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  background: z.string().max(20_000).default(''),
  goal: z.string().max(20_000).default(''),
  role: z.string().max(20_000).default(''),
  keyDecisions: z.string().max(40_000).default(''),
  outcome: z.string().max(40_000).default(''),
  evidence: z.string().max(40_000).default(''),
  reflections: z.string().max(20_000).default(''),
  storytellingVersions: z.string().max(40_000).default(''),
});

function normalizeLegacyProjectPayload(value: unknown): unknown {
  if (value === null || Array.isArray(value) || typeof value !== 'object') return value;
  const payload = value as Record<string, unknown>;
  const normalized = { ...payload };
  let changed = false;
  if (
    typeof payload.outcomesAndEvidence === 'string'
    && (typeof payload.outcome !== 'string' || payload.outcome === '')
  ) {
    normalized.outcome = payload.outcomesAndEvidence;
    changed = true;
  }
  if (
    typeof payload.storytelling_versions === 'string'
    && typeof payload.storytellingVersions !== 'string'
  ) {
    normalized.storytellingVersions = payload.storytelling_versions;
    changed = true;
  }
  return changed ? normalized : value;
}

export const projectPayloadSchema = z.preprocess(
  normalizeLegacyProjectPayload,
  projectPayloadObjectSchema,
);

export const questionPayloadSchema = z.object({
  type: questionTypeSchema,
  text: z.string().trim().min(1).max(20_000),
  answerDraft: z.string().max(40_000).default(''),
  projectIds: z.array(z.string().uuid()).default([]),
  capabilityIds: z.array(z.string().uuid()).default([]),
  occurrenceCount: z.number().int().nonnegative().default(0),
  status: z.string().trim().min(1).max(80).default('active'),
});

export const capabilityPayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  jdFrequency: z.number().int().nonnegative(),
  evidence: z.string().max(40_000).default(''),
  gaps: z.string().max(40_000).default(''),
  mergedIntoId: z.string().uuid().nullable().default(null),
});

export const insightPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(40_000),
  positionId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  questionId: z.string().uuid().nullable().default(null),
  capabilityId: z.string().uuid().nullable().default(null),
});

export const proposalPayloadSchema = z.discriminatedUnion('targetType', [
  z.object({ targetType: z.literal('project'), payload: projectPayloadSchema }),
  z.object({ targetType: z.literal('question'), payload: questionPayloadSchema }),
  z.object({ targetType: z.literal('capability'), payload: capabilityPayloadSchema }),
  z.object({ targetType: z.literal('insight'), payload: insightPayloadSchema }),
]);

const changeProposalBaseSchema = z.object({
  targetType: proposalTargetSchema,
  targetId: z.string().uuid().nullable(),
  operation: proposalOperationSchema,
  rationale: z.string().trim().min(1).max(20_000),
  positionId: z.string().uuid().nullable(),
  interviewId: z.string().uuid().nullable(),
}).and(proposalPayloadSchema);

export const changeProposalInputSchema = changeProposalBaseSchema.superRefine((proposal, context) => {
  if (proposal.operation === 'create' && proposal.targetId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetId'],
      message: '创建建议不能指定既有资产',
    });
  }
  if (
    (proposal.operation === 'update' || proposal.operation === 'merge')
    && proposal.targetId === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetId'],
      message: '更新或合并建议必须指定目标资产',
    });
  }
});

export const idSchema = z.string().uuid();
export const noPayloadSchema = z.undefined();
export const optionalIdSchema = z.object({ id: idSchema });

export const positionListFilterSchema = z.object({
  query: z.string().max(500).optional(),
  stage: canonicalStageSchema.optional(),
}).optional();

export const positionUpdateSchema = z.object({
  id: idSchema,
  input: positionInputSchema,
});

export const processStageSaveSchema = processStageInputSchema.extend({
  id: idSchema.optional(),
});

export const reorderStagesSchema = z.object({
  positionId: idSchema,
  orderedIds: z.array(idSchema),
});

const preparationStoredFieldsSchema = z.object({
  positionId: idSchema,
  rawJdSnapshot: z.string().max(100_000),
  promptSnapshot: z.string().max(200_000),
  assetsSnapshot: z.string().max(1_000_000),
  modelSnapshot: z.string().trim().min(1).max(500),
  outputSnapshot: z.string().max(1_000_000),
  generatedAt: z.string().datetime(),
}).strict();

const nonBlankSnapshotText = (maximum: number) => z.string()
  .max(maximum)
  .refine((value) => value.trim().length > 0, '内容不能为空');

export const preparationGenerateSchema = z.object({
  positionId: idSchema,
  projectIds: z.array(idSchema).max(100),
  questionIds: z.array(idSchema).max(200),
}).strict();

export const legacyPreparationOutputSchema = z.object({
  roleSummary: nonBlankSnapshotText(20_000),
  capabilityFocus: z.array(z.object({
    name: nonBlankSnapshotText(200),
    reason: nonBlankSnapshotText(10_000),
  }).strict()).max(50),
  projectTalkingPoints: z.array(z.object({
    projectId: idSchema,
    points: z.array(nonBlankSnapshotText(10_000)).min(1).max(30),
  }).strict()).max(100),
  likelyQuestions: z.array(z.object({
    question: nonBlankSnapshotText(20_000),
    answerOutline: nonBlankSnapshotText(40_000),
  }).strict()).max(100),
  candidateQuestions: z.array(nonBlankSnapshotText(20_000)).max(100),
  riskNotes: z.array(nonBlankSnapshotText(20_000)).max(100),
}).strict();

const competencyRankSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const starsStageSchema = z.enum([
  'Startup',
  'Turnaround',
  'Realignment',
  'Sustaining Success',
  'Crisis',
]);

export const preparationOutputSchema = legacyPreparationOutputSchema.extend({
  competencyMap: z.array(z.object({
    rank: competencyRankSchema,
    name: nonBlankSnapshotText(200),
    evidence: nonBlankSnapshotText(10_000),
  }).strict()).length(5).superRefine((items, context) => {
    items.forEach((item, index) => {
      if (item.rank !== index + 1) {
        context.addIssue({
          code: 'custom',
          path: [index, 'rank'],
          message: '能力排名必须按 1 到 5 唯一且有序',
        });
      }
    });
  }),
  companyMap: z.object({
    stage: starsStageSchema,
    summary: nonBlankSnapshotText(20_000),
    priorities: z.array(nonBlankSnapshotText(10_000)).min(1).max(20),
    culture: z.array(nonBlankSnapshotText(10_000)).min(1).max(20),
  }).strict(),
  dreamCandidateAvatar: z.object({
    typicalDay: z.array(z.object({
      time: nonBlankSnapshotText(80),
      activity: nonBlankSnapshotText(10_000),
      purpose: nonBlankSnapshotText(10_000),
    }).strict()).min(1).max(24),
    superpower: nonBlankSnapshotText(20_000),
    successStory: nonBlankSnapshotText(40_000),
    quote: nonBlankSnapshotText(20_000),
    painProfile: nonBlankSnapshotText(40_000),
  }).strict(),
  actionGuide: z.object({
    selfIntroTagline: nonBlankSnapshotText(20_000),
    cultureFitPhrase: nonBlankSnapshotText(20_000),
    questions: z.tuple([
      nonBlankSnapshotText(20_000),
      nonBlankSnapshotText(20_000),
      nonBlankSnapshotText(20_000),
    ]),
  }).strict(),
}).strict();

export const preparationHistoricalOutputSchema = z.union([
  preparationOutputSchema,
  legacyPreparationOutputSchema,
]);

const projectSnapshotSchema = projectPayloadObjectSchema.extend({
  id: idSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

const questionSnapshotSchema = questionPayloadSchema.extend({
  id: idSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const preparationAssetsSnapshotSchema = z.object({
  projects: z.array(projectSnapshotSchema).max(100),
  questions: z.array(questionSnapshotSchema).max(200),
}).strict();

export const preparationOutboundPositionSchema = z.object({
  company: z.string().max(300),
  title: z.string().max(300),
  rawJd: z.string().max(100_000),
}).strict();

export function canonicalizePreparationJobData(
  position: unknown,
  selectedAssets: unknown,
) {
  const canonicalPosition = preparationOutboundPositionSchema.parse(position);
  const canonicalSelectedAssets = preparationAssetsSnapshotSchema.parse(selectedAssets);
  return {
    position: canonicalPosition,
    selectedAssets: canonicalSelectedAssets,
    jobDataJson: JSON.stringify({
      position: canonicalPosition,
      selectedAssets: canonicalSelectedAssets,
    }, null, 2),
  };
}

export const preparationOutboundPreviewSchema = z.object({
  prompt: z.string().max(200_000).refine(
    (value) => value.trim().length > 0,
    'Prompt 不能为空',
  ),
  position: preparationOutboundPositionSchema,
  selectedAssets: preparationAssetsSnapshotSchema,
  jobDataJson: z.string().max(1_000_000),
}).strict().superRefine((value, context) => {
  const canonical = canonicalizePreparationJobData(
    value.position,
    value.selectedAssets,
  );
  if (value.jobDataJson !== canonical.jobDataJson) {
    context.addIssue({
      code: 'custom',
      path: ['jobDataJson'],
      message: '外发 JSON 与预览快照不一致',
    });
  }
});

export const preparationInputSchema = preparationStoredFieldsSchema.superRefine(
  (value, context) => {
    try {
      preparationAssetsSnapshotSchema.parse(JSON.parse(value.assetsSnapshot));
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['assetsSnapshot'],
        message: 'Invalid preparation asset snapshot',
      });
    }
    try {
      preparationOutputSchema.parse(JSON.parse(value.outputSnapshot));
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['outputSnapshot'],
        message: 'Invalid preparation output snapshot',
      });
    }
  },
);

export const preparationMaterialSchema = z.object({
  id: idSchema,
  positionId: idSchema,
  rawJdSnapshot: z.string().max(100_000),
  promptSnapshot: z.string().max(200_000),
  assetsSnapshot: z.string().max(1_000_000),
  modelSnapshot: z.string().trim().min(1).max(500),
  outputSnapshot: z.string().max(1_000_000),
  generatedAt: z.string().min(1).max(100),
  createdAt: z.string().min(1).max(100),
}).strict();

export const preparationReadableMaterialSchema = preparationMaterialSchema.superRefine((value, context) => {
  try {
    preparationAssetsSnapshotSchema.parse(JSON.parse(value.assetsSnapshot));
  } catch {
    context.addIssue({
      code: 'custom',
      path: ['assetsSnapshot'],
      message: '准备材料资产快照无效',
    });
  }
  try {
    preparationHistoricalOutputSchema.parse(JSON.parse(value.outputSnapshot));
  } catch {
    context.addIssue({
      code: 'custom',
      path: ['outputSnapshot'],
      message: '准备材料输出快照无效',
    });
  }
});

export const preparationMaterialListSchema = z.array(preparationMaterialSchema);

const interviewBaseSchema = z.object({
  positionId: idSchema,
  roundName: z.string().trim().min(1).max(120),
  interviewDate: isoDateSchema.nullable(),
  transcript: z.string().max(1_000_000),
  personalNotes: z.string().max(100_000),
  feedbackResult: z.string().max(20_000).nullable(),
});

export const interviewInputSchema = interviewBaseSchema.extend({
  summary: z.never().optional(),
});

// User edits cannot silently overwrite an AI-generated summary. That field is
// persisted only by InterviewsRepository.saveSummary.
export const interviewUpdateSchema = interviewBaseSchema.extend({
  summary: z.never().optional(),
});

export const interviewSummarySchema = z.string().trim().min(1).max(200_000);
export const interviewUpdateRequestSchema = z.object({
  id: idSchema,
  input: interviewUpdateSchema,
});

export const projectSaveSchema = z.preprocess(
  normalizeLegacyProjectPayload,
  projectPayloadObjectSchema.extend({ id: idSchema.optional() }),
);
export const questionSaveSchema = questionPayloadSchema.extend({ id: idSchema.optional() });
export const capabilitySaveSchema = capabilityPayloadSchema.extend({ id: idSchema.optional() });
export const insightSaveSchema = insightPayloadSchema.extend({ id: idSchema.optional() });

export const questionListSchema = z.object({
  type: questionTypeSchema.optional(),
}).optional();

export const assetReferenceSchema = z.object({
  type: proposalTargetSchema,
  id: idSchema,
});

export const proposalListSchema = z.object({
  status: proposalStatusSchema.optional(),
}).optional();

export const proposalAcceptSchema = z.object({
  id: idSchema,
  editedPayload: z.unknown(),
});

export const promptSaveSchema = z.object({
  kind: promptKindSchema,
  content: z.string()
    .max(200_000)
    .refine((value) => value.trim().length > 0, 'Prompt 模板不能为空'),
});

function normalizeBaseUrl(value: string): string {
  const normalizedValue = value.trim();
  if (/[\u0000-\u001F\u007F]/.test(normalizedValue)) {
    throw new Error('API 地址不能包含控制字符');
  }
  if (!/^https?:\/\/[^/\\]/i.test(normalizedValue)) {
    throw new Error('API 地址必须以 http:// 或 https:// 开始');
  }
  const schemeEnd = normalizedValue.indexOf('://');
  const authorityAndPath = schemeEnd >= 0
    ? normalizedValue.slice(schemeEnd + 3)
    : '';
  const authorityEnd = authorityAndPath.search(/[/?#]/);
  const authority = authorityEnd === -1
    ? authorityAndPath
    : authorityAndPath.slice(0, authorityEnd);
  const rawHostname = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1).toLowerCase()
    : authority.split(':', 1)[0].toLowerCase();
  const url = new URL(normalizedValue);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API 地址必须使用 HTTP 或 HTTPS');
  }
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (
    url.protocol === 'http:'
    && (!loopbackHosts.has(url.hostname) || !loopbackHosts.has(rawHostname))
  ) {
    throw new Error('远程 API 地址必须使用 HTTPS');
  }
  if (
    authority.includes('@')
    || normalizedValue.includes('?')
    || normalizedValue.includes('#')
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error('API 地址不能包含凭据、查询参数或片段');
  }
  return url.toString().replace(/\/+$/, '');
}

export const aiBaseUrlSchema = z.string().trim().min(1).max(2_000).transform(
  (value, context) => {
    try {
      return normalizeBaseUrl(value);
    } catch {
      context.addIssue({
        code: 'custom',
        message: '请输入有效的 HTTP 或 HTTPS API 地址',
      });
      return z.NEVER;
    }
  },
);

export const aiSettingsSaveSchema = z.object({
  baseUrl: aiBaseUrlSchema,
  model: z.string().trim().min(1).max(500),
  apiKey: z.string().max(10_000).optional().default(''),
});

export const aiPublicSettingsSchema = z.object({
  baseUrl: z.string(),
  model: z.string(),
  hasApiKey: z.boolean(),
});

export const aiConnectionResultSchema = z.object({
  ok: z.literal(true),
  message: z.literal('连接成功，可以使用。'),
});

export const promptTemplateSchema = z.object({
  id: idSchema,
  kind: promptKindSchema,
  name: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const promptTemplateListSchema = z.array(promptTemplateSchema);
