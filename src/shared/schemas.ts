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
  rawJd: z.string().min(1).max(100_000),
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

export const projectPayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  background: z.string().max(20_000).default(''),
  goal: z.string().max(20_000).default(''),
  role: z.string().max(20_000).default(''),
  keyDecisions: z.string().max(40_000).default(''),
  outcomesAndEvidence: z.string().max(40_000).default(''),
  reflections: z.string().max(20_000).default(''),
  storytellingVersions: z.string().max(40_000).default(''),
});

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

export const preparationInputSchema = z.object({
  positionId: idSchema,
  rawJdSnapshot: z.string().max(100_000),
  promptSnapshot: z.string().max(100_000),
  assetsSnapshot: z.string().max(1_000_000),
  modelSnapshot: z.string().trim().min(1).max(500),
  outputSnapshot: z.string().max(1_000_000),
  generatedAt: z.string().datetime(),
});

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

export const projectSaveSchema = projectPayloadSchema.extend({ id: idSchema.optional() });
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
  content: z.string().trim().min(1).max(200_000),
});
