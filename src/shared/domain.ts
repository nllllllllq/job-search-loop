export type CanonicalStage =
  | 'interested'
  | 'applied'
  | 'assessment'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export type ProposalStatus = 'pending' | 'accepted' | 'ignored';
export type ProposalTarget = 'project' | 'question' | 'capability' | 'insight';
export type ProposalOperation = 'create' | 'update' | 'merge';
export type QuestionType = 'interviewer' | 'candidate';
export type PromptKind = 'preparation' | 'interview-review' | 'capability-analysis';

export interface PositionInput {
  company: string;
  title: string;
  interest: 1 | 2 | 3 | 4 | 5;
  rawJd: string;
}

export interface ProcessStageInput {
  positionId: string;
  name: string;
  canonicalStage: CanonicalStage;
  actualDate: string | null;
  expectedDate: string | null;
  feedback: string;
  notes: string;
  orderIndex: number;
}

export interface Position extends PositionInput {
  id: string;
  currentStage: CanonicalStage | null;
  finalResult: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PositionListItem {
  id: string;
  company: string;
  title: string;
  interest: 1 | 2 | 3 | 4 | 5;
  currentStage: CanonicalStage | null;
  finalResult: string | null;
  updatedAt: string;
}

export interface PositionDetail extends Position {
  stages: ProcessStage[];
  preparations: PreparationMaterial[];
  interviews: Interview[];
}

export interface ProcessStage extends ProcessStageInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreparationMaterial {
  id: string;
  positionId: string;
  rawJdSnapshot: string;
  promptSnapshot: string;
  assetsSnapshot: string;
  modelSnapshot: string;
  outputSnapshot: string;
  generatedAt: string;
  createdAt: string;
}

export interface Interview {
  id: string;
  positionId: string;
  roundName: string;
  interviewDate: string | null;
  transcript: string;
  personalNotes: string;
  summary: string | null;
  feedbackResult: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  background: string;
  goal: string;
  role: string;
  keyDecisions: string;
  outcome: string;
  evidence: string;
  reflections: string;
}

export interface Project extends ProjectInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionInput {
  type: QuestionType;
  text: string;
  answerDraft: string;
  projectIds: string[];
  capabilityIds: string[];
  occurrenceCount: number;
  status: string;
}

export interface Question extends QuestionInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityInput {
  name: string;
  jdFrequency: number;
  evidence: string;
  gaps: string;
  mergedIntoId: string | null;
}

export interface Capability extends CapabilityInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityEvidence {
  id: string;
  capabilityId: string;
  positionId: string | null;
  interviewId: string | null;
  evidence: string;
  createdAt: string;
}

export interface InsightInput {
  title: string;
  content: string;
  positionId: string | null;
  projectId: string | null;
  questionId: string | null;
  capabilityId: string | null;
}

export interface Insight extends InsightInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeProposalInput {
  targetType: ProposalTarget;
  targetId: string | null;
  operation: ProposalOperation;
  payload: unknown;
  rationale: string;
  positionId: string | null;
  interviewId: string | null;
}

export interface ChangeProposal extends ChangeProposalInput {
  id: string;
  status: ProposalStatus;
  acceptedPayload: unknown | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface AssetVersion {
  id: string;
  assetType: ProposalTarget;
  assetId: string;
  version: number;
  snapshot: string;
  createdAt: string;
}

export interface PromptTemplate {
  id: string;
  kind: PromptKind;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  totalPositions: number;
  stageDistribution: Array<{ stage: CanonicalStage; count: number }>;
  positionsWithInterviews: number;
  completedReviews: number;
  pendingProposals: number;
  processEvents: Array<{
    positionId: string;
    positionLabel: string;
    stageName: string;
    canonicalStage: CanonicalStage;
    date: string;
    dateType: 'actual' | 'expected';
  }>;
  capabilityFrequency: Array<{
    capabilityId: string;
    name: string;
    jdFrequency: number;
    evidenceCount: number;
  }>;
}
