import { z } from 'zod';

const canonicalStages = [
  'interested', 'applied', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn',
] as const;
const proposalStatuses = ['pending', 'accepted', 'ignored'] as const;
const proposalTargets = ['project', 'question', 'capability', 'insight'] as const;
const proposalOperations = ['create', 'update', 'merge'] as const;
const questionTypes = ['interviewer', 'candidate'] as const;
const promptKinds = [
  'preparation',
  'interview-review',
  'capability-analysis',
  'project-import',
  'position-image',
] as const;
const aiTaskKinds = ['preparation'] as const;
const aiTaskStatuses = ['queued', 'running', 'succeeded', 'failed', 'interrupted'] as const;

const interestSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export function normalizeCompanyCandidate(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s\p{P}]+/gu, '');
}

// Candidate normalization only supports an explicit user decision; it never
// changes how positions are grouped by itself.
export const companyIdentitySchema = z.string().trim().min(1).max(120)
  .refine((value) => normalizeCompanyCandidate(value).length > 0, 'Company name cannot be only punctuation or whitespace');

export const canonicalStageSchema = z.enum(canonicalStages);
export const proposalStatusSchema = z.enum(proposalStatuses);
export const proposalTargetSchema = z.enum(proposalTargets);
export const proposalOperationSchema = z.enum(proposalOperations);
export const questionTypeSchema = z.enum(questionTypes);
export const promptKindSchema = z.enum(promptKinds);
export const aiTaskKindSchema = z.enum(aiTaskKinds);
export const aiTaskStatusSchema = z.enum(aiTaskStatuses);
export const aiTaskSafeErrorSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  statusCode: z.number().int().min(100).max(599).nullable(),
  requestId: z.string().trim().min(1).max(500).nullable(),
}).strict();
export const aiTaskSchema = z.object({
  id: z.string().uuid(),
  kind: aiTaskKindSchema,
  positionId: z.string().uuid(),
  status: aiTaskStatusSchema,
  safeError: aiTaskSafeErrorSchema.nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
}).strict();
export const aiTaskListSchema = z.array(aiTaskSchema);
export const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须是 YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, '日期必须是实际存在的 YYYY-MM-DD 日期');

export const positionInputSchema = z.object({
  company: companyIdentitySchema,
  title: z.string().trim().min(1).max(120),
  location: z.string().trim().max(200).default(''),
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
  unclassifiedNotes: z.string().max(100_000).default(''),
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
  projectIds: z.array(z.string().uuid()).max(100).default([]),
  capabilityIds: z.array(z.string().uuid()).max(100).default([]),
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

// AI proposals and user-edited acceptance payloads intentionally use a
// separate contract from the forgiving CRUD forms above. Nothing is defaulted
// or silently stripped at an AI/write boundary.
export const strictProjectProposalPayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  background: z.string().max(20_000),
  goal: z.string().max(20_000),
  role: z.string().max(20_000),
  keyDecisions: z.string().max(40_000),
  outcome: z.string().max(40_000),
  evidence: z.string().max(40_000),
  reflections: z.string().max(20_000),
  storytellingVersions: z.string().max(40_000),
  unclassifiedNotes: z.string().max(100_000),
}).strict();

export const strictQuestionProposalPayloadSchema = z.object({
  type: questionTypeSchema,
  text: z.string().trim().min(1).max(20_000),
  answerDraft: z.string().max(40_000),
  projectIds: z.array(z.string().uuid()).max(100),
  capabilityIds: z.array(z.string().uuid()).max(100),
  occurrenceCount: z.number().int().nonnegative(),
  status: z.string().trim().min(1).max(80),
}).strict();

export const strictCapabilityProposalPayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  jdFrequency: z.number().int().nonnegative(),
  evidence: z.string().max(40_000),
  gaps: z.string().max(40_000),
  mergedIntoId: z.string().uuid().nullable(),
}).strict();

export const strictInsightProposalPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(40_000),
  positionId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  questionId: z.string().uuid().nullable(),
  capabilityId: z.string().uuid().nullable(),
}).strict();

const strictProposalCommon = {
  targetId: z.string().uuid().nullable(),
  operation: proposalOperationSchema,
  rationale: z.string().trim().min(1).max(20_000),
  positionId: z.string().uuid().nullable(),
  interviewId: z.string().uuid().nullable(),
  analysisRunId: z.string().uuid().nullable().optional().default(null),
};

export const proposalPayloadSchema = z.discriminatedUnion('targetType', [
  z.object({
    ...strictProposalCommon,
    targetType: z.literal('project'),
    payload: strictProjectProposalPayloadSchema,
  }).strict(),
  z.object({
    ...strictProposalCommon,
    targetType: z.literal('question'),
    payload: strictQuestionProposalPayloadSchema,
  }).strict(),
  z.object({
    ...strictProposalCommon,
    targetType: z.literal('capability'),
    payload: strictCapabilityProposalPayloadSchema,
  }).strict(),
  z.object({
    ...strictProposalCommon,
    targetType: z.literal('insight'),
    payload: strictInsightProposalPayloadSchema,
  }).strict(),
]);

export const changeProposalInputSchema = proposalPayloadSchema.superRefine((proposal, context) => {
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
export const backupActionResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('cancelled') }).strict(),
  z.object({ status: z.literal('exported') }).strict(),
  z.object({ status: z.literal('restored') }).strict(),
]);
export const backupRestoreOptionsSchema = z.object({
  deepCheck: z.boolean().optional(),
}).strict().optional();
export const backupProgressSchema = z.object({
  operation: z.enum(['idle', 'export', 'restore', 'deep-check']),
  phase: z.string().min(1).max(100),
  percent: z.number().int().min(0).max(100),
  cancellable: z.boolean(),
  active: z.boolean(),
}).strict();
export const backupCancelResultSchema = z.object({
  status: z.enum(['cancelled', 'not-cancellable']),
}).strict();
export const rollbackSummarySchema = z.object({
  id: z.string().min(1).max(255),
  label: z.string().min(1).max(500),
  createdAt: z.iso.datetime(),
  size: z.number().int().nonnegative(),
  quickStatus: z.literal('valid'),
  deepStatus: z.enum(['unchecked', 'valid']),
}).strict();
export const rollbackSummaryArraySchema = z.array(rollbackSummarySchema);
export const rollbackCheckInputSchema = z.object({
  id: z.string().min(1).max(255),
  deep: z.boolean(),
}).strict();
export const rollbackIdSchema = z.string().min(1).max(255);

export const positionListFilterSchema = z.object({
  query: z.string().max(500).optional(),
  stage: canonicalStageSchema.optional(),
}).optional();

export const companyAliasConfirmationSchema = z.object({
  canonicalName: companyIdentitySchema,
  alias: companyIdentitySchema,
}).strict().refine(
  (value) => value.canonicalName !== value.alias,
  { message: 'Company alias must differ from its canonical name', path: ['alias'] },
);

export const companyAliasSchema = companyAliasConfirmationSchema.extend({
  createdAt: z.string().datetime(),
}).strict();

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

export const removeStageSchema = z.object({
  positionId: idSchema,
  stageId: idSchema,
}).strict();

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
  location: z.string().max(200).default(''),
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
  transcript: z.string().max(1_000_000)
    .refine((value) => value.trim().length > 0, '面试文字记录不能为空'),
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
export const capabilityMergeSchema = z.object({
  sourceId: idSchema,
  targetId: idSchema,
}).strict();
const capabilityRecordSchema = capabilityPayloadSchema.extend({
  id: idSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export const capabilityMergeResultSchema = z.object({
  source: capabilityRecordSchema,
  target: capabilityRecordSchema,
}).strict();
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
  editedPayload: z.unknown().optional(),
});

const reviewProposalCommon = {
  targetId: idSchema.nullable(),
  operation: proposalOperationSchema,
  rationale: nonBlankSnapshotText(20_000),
};

const interviewReviewProposalSchema = z.discriminatedUnion('targetType', [
  z.object({
    ...reviewProposalCommon,
    targetType: z.literal('project'),
    payload: strictProjectProposalPayloadSchema,
  }).strict(),
  z.object({
    ...reviewProposalCommon,
    targetType: z.literal('question'),
    payload: strictQuestionProposalPayloadSchema,
  }).strict(),
  z.object({
    ...reviewProposalCommon,
    targetType: z.literal('capability'),
    payload: strictCapabilityProposalPayloadSchema,
  }).strict(),
  z.object({
    ...reviewProposalCommon,
    targetType: z.literal('insight'),
    payload: strictInsightProposalPayloadSchema,
  }).strict(),
]).superRefine((proposal, context) => {
  if (proposal.operation === 'create' && proposal.targetId !== null) {
    context.addIssue({
      code: 'custom',
      path: ['targetId'],
      message: '创建建议不能指定已有资产',
    });
  }
  if (proposal.operation !== 'create' && proposal.targetId === null) {
    context.addIssue({
      code: 'custom',
      path: ['targetId'],
      message: '更新或合并建议必须指定目标资产',
    });
  }
});

export const interviewReviewOutputSchema = z.object({
  summary: nonBlankSnapshotText(80_000),
  strengths: z.array(nonBlankSnapshotText(2_000)).max(20),
  gaps: z.array(nonBlankSnapshotText(2_000)).max(20),
  proposals: z.array(interviewReviewProposalSchema).max(50),
}).strict();

export const INTERVIEW_REVIEW_INPUT_SNAPSHOT_MAX_LENGTH = 1_500_000;

export const interviewReviewSnapshotSchema = z.object({
  promptSnapshot: nonBlankSnapshotText(200_000),
  modelSnapshot: nonBlankSnapshotText(500),
  inputSnapshot: nonBlankSnapshotText(INTERVIEW_REVIEW_INPUT_SNAPSHOT_MAX_LENGTH),
  output: interviewReviewOutputSchema,
  reviewedAt: z.string().datetime(),
}).strict();

export const interviewReviewAuditSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none') }).strict(),
  z.object({
    status: z.literal('valid'),
    snapshot: interviewReviewSnapshotSchema,
  }).strict(),
  z.object({ status: z.literal('invalid') }).strict(),
]);

export const interviewSchema = z.object({
  id: idSchema,
  positionId: idSchema,
  roundName: z.string().trim().min(1).max(120),
  interviewDate: isoDateSchema.nullable(),
  transcript: z.string().max(1_000_000),
  personalNotes: z.string().max(100_000),
  summary: z.string().max(200_000).nullable(),
  reviewSnapshot: interviewReviewAuditSchema,
  feedbackResult: z.string().max(20_000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const interviewListSchema = z.array(interviewSchema);

function payloadForTarget(targetType: typeof proposalTargets[number], payload: unknown) {
  switch (targetType) {
    case 'project':
      return strictProjectProposalPayloadSchema.safeParse(payload);
    case 'question':
      return strictQuestionProposalPayloadSchema.safeParse(payload);
    case 'capability':
      return strictCapabilityProposalPayloadSchema.safeParse(payload);
    case 'insight':
      return strictInsightProposalPayloadSchema.safeParse(payload);
  }
}

export const changeProposalSchema = z.object({
  id: idSchema,
  targetType: proposalTargetSchema,
  targetId: idSchema.nullable(),
  operation: proposalOperationSchema,
  payload: z.unknown(),
  rationale: nonBlankSnapshotText(20_000),
  positionId: idSchema.nullable(),
  interviewId: idSchema.nullable(),
  analysisRunId: idSchema.nullable(),
  status: proposalStatusSchema,
  acceptedPayload: z.unknown().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  context: z.object({
    position: z.object({
      company: z.string().max(120),
      title: z.string().max(120),
    }).strict().nullable(),
    interview: z.object({
      roundName: z.string().max(120),
      interviewDate: isoDateSchema.nullable(),
    }).strict().nullable(),
  }).strict().optional(),
}).strict().superRefine((proposal, context) => {
  if (!payloadForTarget(proposal.targetType, proposal.payload).success) {
    context.addIssue({
      code: 'custom',
      path: ['payload'],
      message: '建议内容与目标类型不匹配',
    });
  }
  if (
    proposal.acceptedPayload !== null
    && !payloadForTarget(proposal.targetType, proposal.acceptedPayload).success
  ) {
    context.addIssue({
      code: 'custom',
      path: ['acceptedPayload'],
      message: '已接受内容与目标类型不匹配',
    });
  }
});

export const importedFileSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().max(200),
  bytes: z.instanceof(Uint8Array),
}).strict();

export const POSITION_IMPORT_IMAGE_MAX_COUNT = 10;
export const POSITION_IMPORT_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const POSITION_IMPORT_IMAGE_MAX_PIXELS = 40_000_000;

export const importedImageSchema = importedFileSchema.extend({
  type: z.enum(['image/png', 'image/jpeg'], {
    message: 'Only PNG and JPEG images are supported.',
  }),
  bytes: z.instanceof(Uint8Array).refine(
    (value) => value.byteLength <= POSITION_IMPORT_IMAGE_MAX_BYTES,
    'Each image must be 12 MB or smaller.',
  ),
  width: z.number().int().positive().max(100_000),
  height: z.number().int().positive().max(100_000),
}).strict();

export const positionImportTextSchema = z.object({
  text: z.string().trim().min(1).max(100_000),
}).strict();

export const positionImportImagesSchema = z.object({
  images: z.array(importedImageSchema)
    .min(1, 'Select at least one image.')
    .max(POSITION_IMPORT_IMAGE_MAX_COUNT, 'Select no more than 10 images.'),
  mode: z.enum(['vision', 'ocr-text']).default('vision'),
}).strict().superRefine(({ images }, context) => {
  const pixels = images.reduce((total, image) => total + image.width * image.height, 0);
  if (pixels > POSITION_IMPORT_IMAGE_MAX_PIXELS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['images'],
      message: 'Combined image resolution must not exceed 40 MP.',
    });
  }
});

const importConfidenceSchema = z.number().min(0).max(1);

// The AI response is intentionally narrower than the renderer's editable
// import preview. It must not carry a session id or a ready-to-write position.
export const positionImageRecognitionPreviewSchema = z.object({
  company: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  location: z.string().trim().max(200),
  rawJd: z.string().trim().min(1).max(100_000),
  confidence: z.object({
    company: importConfidenceSchema,
    title: importConfidenceSchema,
    location: importConfidenceSchema,
    rawJd: importConfidenceSchema,
  }).strict(),
  warnings: z.array(z.string().trim().min(1).max(1_000)).max(20),
}).strict();

export const projectImportDocumentSchema = z.object({
  file: importedFileSchema,
  mode: z.enum(['ai', 'local']),
}).strict();

export const projectSegmentUpdateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rename'),
    tempId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
  }).strict(),
  z.object({ type: z.literal('merge-next'), tempId: z.string().uuid() }).strict(),
  z.object({
    type: z.literal('split'),
    tempId: z.string().uuid(),
    marker: z.string().trim().min(1).max(20_000),
  }).strict(),
  z.object({
    type: z.literal('reorder'),
    orderedIds: z.array(z.string().uuid()).min(1).max(30),
  }).strict(),
  z.object({ type: z.literal('remove'), tempId: z.string().uuid() }).strict(),
]);

export const projectSegmentsUpdateSchema = z.object({
  sessionId: z.string().uuid(),
  operation: projectSegmentUpdateSchema,
}).strict();

export const importCancelSchema = z.object({
  sessionId: z.string().uuid(),
}).strict();

export const changeProposalArraySchema = z.array(changeProposalSchema);

const changeProposalContextSchema = z.object({
  position: z.object({
    company: z.string().max(120),
    title: z.string().max(120),
  }).strict().nullable(),
  interview: z.object({
    roundName: z.string().max(120),
    interviewDate: isoDateSchema.nullable(),
  }).strict().nullable(),
}).strict();

export const changeProposalListItemSchema = changeProposalSchema.and(
  z.object({ context: changeProposalContextSchema }).loose(),
);

export const corruptChangeProposalSchema = z.object({
  id: z.string().max(500),
  status: proposalStatusSchema.nullable(),
  createdAt: z.string().datetime().nullable(),
  code: z.literal('CORRUPT_PROPOSAL'),
  message: z.string().max(500),
  readOnly: z.literal(true),
  context: changeProposalContextSchema,
}).strict();

export const changeProposalListSchema = z.object({
  items: z.array(changeProposalListItemSchema),
  corruptItems: z.array(corruptChangeProposalSchema),
  corruptCount: z.number().int().nonnegative(),
}).strict().superRefine((result, context) => {
  if (result.corruptCount !== result.corruptItems.length) {
    context.addIssue({
      code: 'custom',
      path: ['corruptCount'],
      message: '损坏建议计数不一致',
    });
  }
});

const uniqueIdListSchema = z.array(idSchema).max(100)
  .refine((ids) => new Set(ids).size === ids.length, '资产 ID 不能重复');

export const interviewReviewSelectedAssetIdsSchema = z.object({
  projectIds: uniqueIdListSchema.default([]),
  questionIds: uniqueIdListSchema.default([]),
  capabilityIds: uniqueIdListSchema.default([]),
  insightIds: uniqueIdListSchema.default([]),
}).strict();

export const interviewReviewPreviewInputSchema = z.object({
  interviewId: idSchema,
  selectedAssets: interviewReviewSelectedAssetIdsSchema.default({
    projectIds: [],
    questionIds: [],
    capabilityIds: [],
    insightIds: [],
  }),
}).strict();

const reviewProjectSnapshotSchema = strictProjectProposalPayloadSchema.extend({
  id: idSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
const reviewQuestionSnapshotSchema = strictQuestionProposalPayloadSchema.extend({
  id: idSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
const reviewCapabilitySnapshotSchema = strictCapabilityProposalPayloadSchema.extend({
  id: idSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
const reviewInsightSnapshotSchema = strictInsightProposalPayloadSchema.extend({
  id: idSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const interviewReviewPreviewSchema = z.object({
  token: idSchema,
  provider: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(500),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  positionLabel: z.string().trim().min(1).max(500),
  roundName: z.string().trim().min(1).max(120),
  outbound: z.object({
    position: z.object({
      id: idSchema,
      company: z.string().max(120),
      title: z.string().max(120),
      location: z.string().max(200),
      rawJd: z.string().max(100_000),
    }).strict(),
    interview: interviewBaseSchema.extend({
      id: idSchema,
    }).strict(),
    prompt: nonBlankSnapshotText(200_000),
    selectedAssets: z.object({
      projects: z.array(reviewProjectSnapshotSchema).max(100),
      questions: z.array(reviewQuestionSnapshotSchema).max(100),
      capabilities: z.array(reviewCapabilitySnapshotSchema).max(100),
      insights: z.array(reviewInsightSnapshotSchema).max(100),
    }).strict(),
  }).strict(),
  dataTypes: z.tuple([
    z.literal('面试文字记录'),
    z.literal('个人感受与补充'),
    z.literal('岗位信息与原始 JD'),
    z.literal('面试复盘 Prompt'),
  ]),
}).strict();

export const interviewReviewResultSchema = z.object({
  interview: interviewSchema,
  proposals: changeProposalArraySchema,
}).strict();

export const capabilityAnalysisSelectionSchema = z.array(idSchema)
  .min(2, '请至少选择 2 个岗位')
  .max(20, '一次最多分析 20 个岗位')
  .refine((ids) => new Set(ids).size === ids.length, '岗位不能重复选择');

export const capabilityAnalysisOutputSchema = z.object({
  capabilities: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    jdFrequency: z.number().int().positive(),
    evidence: z.array(z.string().trim().min(1).max(2_000)).max(30),
    gaps: z.array(z.string().trim().min(1).max(2_000)).max(30),
  }).strict()).min(1).max(30),
}).strict();

export const capabilityAnalysisPreviewSchema = z.object({
  token: idSchema,
  provider: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(500),
  prompt: z.string().trim().min(1).max(200_000),
  positions: z.array(z.object({
    id: idSchema,
    label: z.string().trim().min(1).max(500),
    rawJd: z.string().min(1).max(100_000),
  }).strict()).min(2).max(20),
}).strict();

const dashboardPositionSchema = z.object({
  id: idSchema,
  company: z.string().max(120),
  title: z.string().max(120),
  location: z.string().max(200),
  interest: interestSchema,
  currentStage: canonicalStageSchema.nullable(),
  finalResult: z.string().max(20_000).nullable(),
  updatedAt: z.string().datetime(),
}).strict();

export const dashboardSummarySchema = z.object({
  totalPositions: z.number().int().nonnegative(),
  stageDistribution: z.array(z.object({
    stage: canonicalStageSchema,
    count: z.number().int().nonnegative(),
  }).strict()).max(canonicalStages.length),
  positionsWithInterviews: z.number().int().nonnegative(),
  completedReviews: z.number().int().nonnegative(),
  pendingProposals: z.number().int().nonnegative(),
  processEvents: z.array(z.object({
    positionId: idSchema,
    positionLabel: z.string().max(500),
    stageName: z.string().max(120),
    canonicalStage: canonicalStageSchema,
    date: isoDateSchema,
    dateType: z.enum(['actual', 'expected']),
  }).strict()).max(100_000),
  capabilityFrequency: z.array(z.object({
    capabilityId: idSchema,
    name: z.string().max(200),
    jdFrequency: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
  }).strict()).max(100_000),
  recentPositions: z.array(dashboardPositionSchema).max(8),
}).strict();

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

export const aiModelCapabilitiesSchema = z.object({
  images: z.boolean(),
  fileInputProtocol: z.literal('none').optional(),
}).strict();

export const aiSettingsSaveSchema = z.object({
  baseUrl: aiBaseUrlSchema,
  model: z.string().trim().min(1).max(500),
  apiKey: z.string().max(10_000).optional().default(''),
  capabilities: aiModelCapabilitiesSchema.optional(),
});

export const aiPublicSettingsSchema = z.object({
  baseUrl: z.string(),
  model: z.string(),
  hasApiKey: z.boolean(),
  capabilities: aiModelCapabilitiesSchema.optional(),
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
