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
export type PromptKind =
  | 'preparation'
  | 'interview-review'
  | 'capability-analysis'
  | 'project-import';

export type AiTaskKind = 'preparation';
export type AiTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted';

export interface AiTaskSafeError {
  message: string;
  statusCode: number | null;
  requestId: string | null;
}

export interface AiTask {
  id: string;
  kind: AiTaskKind;
  positionId: string;
  status: AiTaskStatus;
  safeError: AiTaskSafeError | null;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
}

export interface PositionInput {
  company: string;
  title: string;
  location?: string;
  interest: 1 | 2 | 3 | 4 | 5;
  rawJd: string;
}

export type ImportSessionId = string;

export interface PositionImportPreview {
  sessionId: ImportSessionId;
  sourceSummary: string;
  suggested: PositionInput;
  confidence: {
    company: number;
    title: number;
    location: number;
    rawJd: number;
  };
  warnings: string[];
}

export interface ProjectSegmentPreview {
  tempId: string;
  name: string;
  sourceText: string;
  suggested: ProjectInput;
  warnings: string[];
}

export interface ProjectImportPreview {
  sessionId: ImportSessionId;
  sourceSummary: string;
  analysisMode: 'ai' | 'local' | 'local-fallback';
  segments: ProjectSegmentPreview[];
  warnings: string[];
}

export interface ImportedFileInput {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export interface ImportedImageInput extends ImportedFileInput {
  width: number;
  height: number;
}

export type ProjectSegmentUpdate =
  | { type: 'rename'; tempId: string; name: string }
  | { type: 'merge-next'; tempId: string }
  | { type: 'split'; tempId: string; marker: string }
  | { type: 'reorder'; orderedIds: string[] }
  | { type: 'remove'; tempId: string };

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

export interface Position extends Omit<PositionInput, 'location'> {
  id: string;
  location: string;
  currentStage: CanonicalStage | null;
  finalResult: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PositionListItem {
  id: string;
  company: string;
  title: string;
  location: string;
  interest: 1 | 2 | 3 | 4 | 5;
  currentStage: CanonicalStage | null;
  finalResult: string | null;
  updatedAt: string;
}

export interface PositionDetail extends Position {
  stages: ProcessStage[];
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

export interface PreparationGenerateInput {
  positionId: string;
  projectIds: string[];
  questionIds: string[];
}

export interface PreparationOutboundPreview {
  prompt: string;
  position: {
    company: string;
    title: string;
    location: string;
    rawJd: string;
  };
  selectedAssets: PreparationAssetsSnapshot;
  jobDataJson: string;
}

export interface LegacyPreparationOutput {
  roleSummary: string;
  capabilityFocus: Array<{ name: string; reason: string }>;
  projectTalkingPoints: Array<{ projectId: string; points: string[] }>;
  likelyQuestions: Array<{ question: string; answerOutline: string }>;
  candidateQuestions: string[];
  riskNotes: string[];
}

export type StarsStage =
  | 'Startup'
  | 'Turnaround'
  | 'Realignment'
  | 'Sustaining Success'
  | 'Crisis';

export interface PreparationOutput extends LegacyPreparationOutput {
  competencyMap: Array<{
    rank: 1 | 2 | 3 | 4 | 5;
    name: string;
    evidence: string;
  }>;
  companyMap: {
    stage: StarsStage;
    summary: string;
    priorities: string[];
    culture: string[];
  };
  dreamCandidateAvatar: {
    typicalDay: Array<{
      time: string;
      activity: string;
      purpose: string;
    }>;
    superpower: string;
    successStory: string;
    quote: string;
    painProfile: string;
  };
  actionGuide: {
    selfIntroTagline: string;
    cultureFitPhrase: string;
    questions: [string, string, string];
  };
}

export type PreparationHistoricalOutput =
  | PreparationOutput
  | LegacyPreparationOutput;

export interface PreparationAssetsSnapshot {
  projects: Project[];
  questions: Question[];
}

export interface Interview {
  id: string;
  positionId: string;
  roundName: string;
  interviewDate: string | null;
  transcript: string;
  personalNotes: string;
  summary: string | null;
  reviewSnapshot: InterviewReviewAudit;
  feedbackResult: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewReviewOutput {
  summary: string;
  strengths: string[];
  gaps: string[];
  proposals: Array<{
    targetType: ProposalTarget;
    targetId: string | null;
    operation: ProposalOperation;
    rationale: string;
    payload: unknown;
  }>;
}

export interface InterviewReviewSnapshot {
  promptSnapshot: string;
  modelSnapshot: string;
  inputSnapshot: string;
  output: InterviewReviewOutput;
  reviewedAt: string;
}

export interface InterviewReviewSelectedAssetIds {
  projectIds: string[];
  questionIds: string[];
  capabilityIds: string[];
  insightIds: string[];
}

export interface InterviewReviewPreviewInput {
  interviewId: string;
  selectedAssets: InterviewReviewSelectedAssetIds;
}

export interface InterviewReviewSelectedAssets {
  projects: Project[];
  questions: Question[];
  capabilities: Capability[];
  insights: Insight[];
}

export interface InterviewReviewOutbound {
  position: Pick<Position, 'id' | 'company' | 'title' | 'location' | 'rawJd'>;
  interview: Pick<
    Interview,
    | 'id'
    | 'positionId'
    | 'roundName'
    | 'interviewDate'
    | 'transcript'
    | 'personalNotes'
    | 'feedbackResult'
  >;
  prompt: string;
  selectedAssets: InterviewReviewSelectedAssets;
}

export interface InterviewReviewPreview {
  token: string;
  provider: string;
  model: string;
  inputHash: string;
  positionLabel: string;
  roundName: string;
  outbound: InterviewReviewOutbound;
  dataTypes: [
    '面试文字记录',
    '个人感受与补充',
    '岗位信息与原始 JD',
    '面试复盘 Prompt',
  ];
}

export interface InterviewReviewResult {
  interview: Interview;
  proposals: ChangeProposal[];
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
  storytellingVersions: string;
  unclassifiedNotes?: string;
}

export type InterviewReviewAudit =
  | { status: 'none' }
  | { status: 'valid'; snapshot: InterviewReviewSnapshot }
  | { status: 'invalid' };

export interface Project extends Omit<ProjectInput, 'unclassifiedNotes'> {
  id: string;
  unclassifiedNotes: string;
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

export interface CapabilityMergeResult {
  source: Capability;
  target: Capability;
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
  analysisRunId?: string | null;
}

export interface ChangeProposal extends ChangeProposalInput {
  id: string;
  analysisRunId: string | null;
  status: ProposalStatus;
  acceptedPayload: unknown | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  context?: ChangeProposalContext;
}

export interface ChangeProposalContext {
  position: { company: string; title: string } | null;
  interview: { roundName: string; interviewDate: string | null } | null;
}

export interface ChangeProposalListItem extends ChangeProposal {
  context: ChangeProposalContext;
}

export interface CorruptChangeProposal {
  id: string;
  status: ProposalStatus | null;
  createdAt: string | null;
  code: 'CORRUPT_PROPOSAL';
  message: string;
  readOnly: true;
  context: ChangeProposalContext;
}

export interface ChangeProposalListResult {
  items: ChangeProposalListItem[];
  corruptItems: CorruptChangeProposal[];
  corruptCount: number;
}

export interface CapabilityAnalysisRun {
  id: string;
  selectedPositionIds: string[];
  promptSnapshot: string;
  providerOrigin: string;
  model: string;
  input: unknown;
  output: unknown;
  createdAt: string;
}

export interface CapabilityAnalysisRunInput {
  selectedPositionIds: string[];
  promptSnapshot: string;
  providerOrigin: string;
  model: string;
  input: unknown;
  output: unknown;
  createdAt: string;
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

export interface AiPublicSettings {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface AiSettingsSaveInput {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface AiConnectionResult {
  ok: true;
  message: '连接成功，可以使用。';
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
  recentPositions: PositionListItem[];
}

export interface CapabilityAnalysisPreview {
  token: string;
  provider: string;
  model: string;
  prompt: string;
  positions: Array<{
    id: string;
    label: string;
    rawJd: string;
  }>;
}

export interface CapabilityAnalysisOutput {
  capabilities: Array<{
    name: string;
    jdFrequency: number;
    evidence: string[];
    gaps: string[];
  }>;
}
