import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ChangeProposal,
  ChangeProposalInput,
  ChangeProposalListResult,
  ChangeProposalListItem,
  ChangeProposalContext,
  CapabilityAnalysisRun,
  CapabilityAnalysisRunInput,
  CorruptChangeProposal,
  InterviewReviewSnapshot,
  ProposalStatus,
  ProposalTarget,
} from '../../shared/domain';
import {
  capabilityPayloadSchema,
  changeProposalInputSchema,
  insightPayloadSchema,
  interviewReviewSnapshotSchema,
  interviewSummarySchema,
  projectPayloadSchema,
  proposalOperationSchema,
  proposalStatusSchema,
  proposalTargetSchema,
  questionPayloadSchema,
  strictCapabilityProposalPayloadSchema,
  strictInsightProposalPayloadSchema,
  strictProjectProposalPayloadSchema,
  strictQuestionProposalPayloadSchema,
  capabilityAnalysisSelectionSchema,
} from '../../shared/schemas';
import { assetRepositoryInternals } from './assets';
import {
  json,
  notFound,
  nullableText,
  RepositoryError,
  row,
  text,
  transaction,
} from './common';

function parsePayload(targetType: ProposalTarget, payload: unknown): Record<string, unknown> {
  switch (targetType) {
    case 'project':
      return projectPayloadSchema.parse(payload);
    case 'question':
      return questionPayloadSchema.parse(payload);
    case 'capability':
      return capabilityPayloadSchema.parse(payload);
    case 'insight':
      return insightPayloadSchema.parse(payload);
  }
}

function parseFinalPayload(
  targetType: ProposalTarget,
  payload: unknown,
): Record<string, unknown> {
  switch (targetType) {
    case 'project':
      return strictProjectProposalPayloadSchema.parse(payload);
    case 'question':
      return strictQuestionProposalPayloadSchema.parse(payload);
    case 'capability':
      return strictCapabilityProposalPayloadSchema.parse(payload);
    case 'insight':
      return strictInsightProposalPayloadSchema.parse(payload);
  }
}

function canonicalPayload(
  targetType: ProposalTarget,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (targetType !== 'question') return payload;
  const question = strictQuestionProposalPayloadSchema.parse(payload);
  return {
    ...question,
    projectIds: [...question.projectIds].sort(),
    capabilityIds: [...question.capabilityIds].sort(),
  };
}

function sameCanonicalPayload(
  targetType: ProposalTarget,
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return JSON.stringify(canonicalPayload(targetType, left))
    === JSON.stringify(canonicalPayload(targetType, right));
}

function decodeProposal(value: unknown): ChangeProposal {
  const data = row(value, 'proposal');
  const targetType = proposalTargetSchema.parse(text(data.target_type, 'target_type'));
  const payload = parseFinalPayload(targetType, json(data.payload_json, 'payload_json'));
  const acceptedValue = data.accepted_payload_json === null
    ? null
    : parseFinalPayload(targetType, json(data.accepted_payload_json, 'accepted_payload_json'));
  return {
    id: text(data.id, 'id'),
    targetType,
    targetId: nullableText(data.target_id, 'target_id'),
    operation: proposalOperationSchema.parse(text(data.operation, 'operation')),
    payload,
    acceptedPayload: acceptedValue,
    rationale: text(data.rationale, 'rationale'),
    positionId: nullableText(data.position_id, 'position_id'),
    interviewId: nullableText(data.interview_id, 'interview_id'),
    analysisRunId: nullableText(data.analysis_run_id, 'analysis_run_id'),
    status: proposalStatusSchema.parse(text(data.status, 'status')),
    createdAt: text(data.created_at, 'created_at'),
    updatedAt: text(data.updated_at, 'updated_at'),
    resolvedAt: nullableText(data.resolved_at, 'resolved_at'),
  };
}

function readTarget(db: DatabaseSync, type: ProposalTarget, id: string): unknown {
  const definitions = {
    project: ['projects', assetRepositoryInternals.decodeProject],
    question: ['questions', assetRepositoryInternals.decodeQuestion],
    capability: ['capabilities', assetRepositoryInternals.decodeCapability],
    insight: ['insights', assetRepositoryInternals.decodeInsight],
  } as const;
  const [table, decoder] = definitions[type];
  const value = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (value === undefined) notFound(type, id);
  return decoder(value);
}

function writeTarget(
  db: DatabaseSync,
  type: ProposalTarget,
  id: string,
  payload: Record<string, unknown>,
  create: boolean,
  now: string,
): void {
  switch (type) {
    case 'project': {
      const value = projectPayloadSchema.parse(payload);
      if (create) {
        db.prepare(`
          INSERT INTO projects (
            id, name, background, goal, role, key_decisions, outcome,
            evidence, reflections, storytelling_versions, unclassified_notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, value.name, value.background, value.goal, value.role, value.keyDecisions,
          value.outcome, value.evidence, value.reflections, value.storytellingVersions,
          value.unclassifiedNotes, now, now,
        );
      } else {
        db.prepare(`
          UPDATE projects SET name = ?, background = ?, goal = ?, role = ?,
            key_decisions = ?, outcome = ?, evidence = ?, reflections = ?,
            storytelling_versions = ?, unclassified_notes = ?, updated_at = ? WHERE id = ?
        `).run(
          value.name, value.background, value.goal, value.role, value.keyDecisions,
          value.outcome, value.evidence, value.reflections, value.storytellingVersions,
          value.unclassifiedNotes, now, id,
        );
      }
      return;
    }
    case 'question': {
      const value = questionPayloadSchema.parse(payload);
      assetRepositoryInternals.validateQuestionReferences(
        db,
        value.projectIds,
        value.capabilityIds,
      );
      if (create) {
        db.prepare(`
          INSERT INTO questions (
            id, type, text, answer_draft, project_ids_json, capability_ids_json,
            occurrence_count, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, value.type, value.text, value.answerDraft, JSON.stringify(value.projectIds),
          JSON.stringify(value.capabilityIds), value.occurrenceCount, value.status, now, now,
        );
      } else {
        db.prepare(`
          UPDATE questions SET type = ?, text = ?, answer_draft = ?, project_ids_json = ?,
            capability_ids_json = ?, occurrence_count = ?, status = ?, updated_at = ?
          WHERE id = ?
        `).run(
          value.type, value.text, value.answerDraft, JSON.stringify(value.projectIds),
          JSON.stringify(value.capabilityIds), value.occurrenceCount, value.status, now, id,
        );
      }
      return;
    }
    case 'capability': {
      const value = capabilityPayloadSchema.parse(payload);
      if (create) {
        db.prepare(`
          INSERT INTO capabilities (
            id, name, jd_frequency, evidence, gaps, merged_into_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, value.name, value.jdFrequency, value.evidence, value.gaps,
          value.mergedIntoId, now, now,
        );
      } else {
        db.prepare(`
          UPDATE capabilities SET name = ?, jd_frequency = ?, evidence = ?, gaps = ?,
            merged_into_id = ?, updated_at = ? WHERE id = ?
        `).run(
          value.name, value.jdFrequency, value.evidence, value.gaps,
          value.mergedIntoId, now, id,
        );
      }
      return;
    }
    case 'insight': {
      const value = insightPayloadSchema.parse(payload);
      if (create) {
        db.prepare(`
          INSERT INTO insights (
            id, title, content, position_id, project_id, question_id, capability_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, value.title, value.content, value.positionId, value.projectId,
          value.questionId, value.capabilityId, now, now,
        );
      } else {
        db.prepare(`
          UPDATE insights SET title = ?, content = ?, position_id = ?, project_id = ?,
            question_id = ?, capability_id = ?, updated_at = ? WHERE id = ?
        `).run(
          value.title, value.content, value.positionId, value.projectId,
          value.questionId, value.capabilityId, now, id,
        );
      }
    }
  }
}

export interface ProposalsRepository {
  list(status?: ProposalStatus): ChangeProposalListResult;
  get(id: string): ChangeProposal;
  create(input: ChangeProposalInput): ChangeProposal;
  commitCapabilityAnalysis(
    run: CapabilityAnalysisRunInput,
    inputs: ChangeProposalInput[],
  ): { run: CapabilityAnalysisRun; proposals: ChangeProposal[] };
  commitReview(
    interviewId: string,
    summary: string,
    snapshot: InterviewReviewSnapshot,
    inputs: ChangeProposalInput[],
  ): ChangeProposal[];
  accept(id: string, editedPayload?: unknown): ChangeProposal;
  ignore(id: string): ChangeProposal;
}

function decodeContext(value: unknown): ChangeProposalContext {
  const data = row(value, 'proposal context');
  const company = nullableText(data.context_position_company, 'context_position_company');
  const title = nullableText(data.context_position_title, 'context_position_title');
  const roundName = nullableText(data.context_interview_round, 'context_interview_round');
  const interviewDate = nullableText(data.context_interview_date, 'context_interview_date');
  return {
    position: company === null || title === null ? null : { company, title },
    interview: roundName === null ? null : { roundName, interviewDate },
  };
}

export function createProposalsRepository(db: DatabaseSync): ProposalsRepository {
  const get = (id: string): ChangeProposal => {
    const value = db.prepare('SELECT * FROM change_proposals WHERE id = ?').get(id);
    if (value === undefined) notFound('Proposal', id);
    try {
      return decodeProposal(value);
    } catch {
      throw new RepositoryError(
        'VALIDATION_ERROR',
        '该建议的数据已损坏，只能只读查看，不能接受或忽略。',
      );
    }
  };
  const insert = (input: ChangeProposalInput): ChangeProposal => {
    const parsed = changeProposalInputSchema.parse(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO change_proposals (
        id, target_type, target_id, operation, payload_json, accepted_payload_json,
        rationale, position_id, interview_id, analysis_run_id, status,
        created_at, updated_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'pending', ?, ?, NULL)
    `).run(
      id,
      parsed.targetType,
      parsed.targetId,
      parsed.operation,
      JSON.stringify(parsed.payload),
      parsed.rationale,
      parsed.positionId,
      parsed.interviewId,
      parsed.analysisRunId,
      now,
      now,
    );
    return get(id);
  };
  return {
    list(status) {
      const values = status
        ? db.prepare(`
          SELECT cp.*,
            p.company AS context_position_company,
            p.title AS context_position_title,
            i.round_name AS context_interview_round,
            i.interview_date AS context_interview_date
          FROM change_proposals cp
          LEFT JOIN positions p ON p.id = cp.position_id
          LEFT JOIN interviews i ON i.id = cp.interview_id
          WHERE cp.status = ?
          ORDER BY cp.created_at DESC
        `).all(proposalStatusSchema.parse(status))
        : db.prepare(`
          SELECT cp.*,
            p.company AS context_position_company,
            p.title AS context_position_title,
            i.round_name AS context_interview_round,
            i.interview_date AS context_interview_date
          FROM change_proposals cp
          LEFT JOIN positions p ON p.id = cp.position_id
          LEFT JOIN interviews i ON i.id = cp.interview_id
          ORDER BY cp.created_at DESC
        `).all();
      const items: ChangeProposalListItem[] = [];
      const corruptItems: CorruptChangeProposal[] = [];
      for (const value of values) {
        try {
          items.push({ ...decodeProposal(value), context: decodeContext(value) });
        } catch {
          const data = row(value, 'proposal');
          const parsedStatus = proposalStatusSchema.safeParse(data.status);
          const createdAt = typeof data.created_at === 'string'
            && !Number.isNaN(Date.parse(data.created_at))
            ? data.created_at
            : null;
          corruptItems.push({
            id: typeof data.id === 'string' ? data.id : 'unknown',
            status: parsedStatus.success ? parsedStatus.data : null,
            createdAt,
            code: 'CORRUPT_PROPOSAL',
            message: '该建议的数据已损坏，只能只读查看。',
            readOnly: true,
            context: decodeContext(value),
          });
        }
      }
      return { items, corruptItems, corruptCount: corruptItems.length };
    },
    get,
    create(input) {
      return insert(input);
    },
    commitCapabilityAnalysis(runInput, inputs) {
      const selectedPositionIds = capabilityAnalysisSelectionSchema.parse(
        runInput.selectedPositionIds,
      );
      const promptSnapshot = interviewSummarySchema.parse(runInput.promptSnapshot);
      const providerOrigin = interviewSummarySchema.max(2_000).parse(runInput.providerOrigin);
      const model = interviewSummarySchema.max(500).parse(runInput.model);
      const createdAt = new Date(runInput.createdAt).toISOString();
      if (createdAt !== runInput.createdAt) {
        throw new RepositoryError('VALIDATION_ERROR', 'Invalid analysis creation time');
      }
      const inputJson = JSON.stringify(runInput.input);
      const outputJson = JSON.stringify(runInput.output);
      if (inputJson === undefined || outputJson === undefined) {
        throw new RepositoryError('VALIDATION_ERROR', 'Analysis snapshots must be JSON values');
      }
      const parsedInputs = inputs.map((input) => changeProposalInputSchema.parse({
        ...input,
        analysisRunId: null,
      }));
      return transaction(db, () => {
        const id = randomUUID();
        db.prepare(`
          INSERT INTO capability_analysis_runs (
            id, selected_position_ids_json, prompt_snapshot, provider_origin,
            model, input_json, output_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          JSON.stringify(selectedPositionIds),
          promptSnapshot,
          providerOrigin,
          model,
          inputJson,
          outputJson,
          createdAt,
        );
        const proposals = parsedInputs.map((input) => insert({
          ...input,
          analysisRunId: id,
        }));
        return {
          run: {
            id,
            selectedPositionIds,
            promptSnapshot,
            providerOrigin,
            model,
            input: runInput.input,
            output: runInput.output,
            createdAt,
          },
          proposals,
        };
      });
    },
    commitReview(interviewId, summary, snapshot, inputs) {
      return transaction(db, () => {
        const parsedSummary = interviewSummarySchema.parse(summary);
        const parsedSnapshot = interviewReviewSnapshotSchema.parse(snapshot);
        const pending = row(db.prepare(`
          SELECT COUNT(*) AS count
          FROM change_proposals
          WHERE interview_id = ? AND status = 'pending'
        `).get(interviewId), 'pending interview proposals');
        if (Number(pending.count) > 0) {
          throw new RepositoryError(
            'CONFLICT',
            '这次面试仍有待确认变更，请先处理后再重新复盘。',
          );
        }
        const now = new Date().toISOString();
        const updated = db.prepare(`
          UPDATE interviews
          SET summary = ?, review_snapshot_json = ?, updated_at = ?
          WHERE id = ? AND review_snapshot_json IS NULL
        `).run(
          parsedSummary,
          JSON.stringify(parsedSnapshot),
          now,
          interviewId,
        );
        if (updated.changes !== 1) {
          const existing = db.prepare('SELECT id FROM interviews WHERE id = ?').get(interviewId);
          if (existing === undefined) notFound('Interview', interviewId);
          throw new RepositoryError(
            'CONFLICT',
            '这次面试已经完成复盘，不能重复覆盖审计快照。',
          );
        }
        return inputs.map(insert);
      });
    },
    accept(id, editedPayload) {
      return transaction(db, () => {
        const proposal = get(id);
        if (proposal.status !== 'pending') {
          throw new RepositoryError('CONFLICT', '该变更建议已处理，不能重复操作');
        }
        const payload = parseFinalPayload(
          proposal.targetType,
          editedPayload === undefined ? proposal.payload : editedPayload,
        );
        const now = new Date().toISOString();
        let targetId = proposal.targetId;
        if (proposal.operation === 'create') {
          targetId = randomUUID();
          writeTarget(db, proposal.targetType, targetId, payload, true, now);
        } else {
          // update and merge both carry a complete, locally validated final
          // asset payload. "merge" is therefore not an implicit field merge:
          // the user explicitly accepts the final representation shown in UI,
          // while this transaction snapshots the retained prior asset.
          if (targetId === null) throw new Error('Proposal target ID is required');
          const previous = readTarget(db, proposal.targetType, targetId);
          const previousPayload = parseFinalPayload(
            proposal.targetType,
            parsePayload(proposal.targetType, previous),
          );
          const unchanged = sameCanonicalPayload(
            proposal.targetType,
            previousPayload,
            payload,
          );
          if (proposal.operation === 'merge' && unchanged) {
            throw new RepositoryError(
              'VALIDATION_ERROR',
              '合并内容与现有资产相同，请先修改建议内容。',
            );
          }
          if (!unchanged) {
            assetRepositoryInternals.insertVersion(
              db,
              proposal.targetType,
              targetId,
              previous,
              now,
            );
            writeTarget(db, proposal.targetType, targetId, payload, false, now);
          }
        }
        db.prepare(`
          UPDATE change_proposals
          SET target_id = ?, accepted_payload_json = ?, status = 'accepted',
              updated_at = ?, resolved_at = ?
          WHERE id = ?
        `).run(targetId, JSON.stringify(payload), now, now, id);
        return get(id);
      });
    },
    ignore(id) {
      return transaction(db, () => {
        const proposal = get(id);
        if (proposal.status !== 'pending') {
          throw new RepositoryError('CONFLICT', '该变更建议已处理，不能重复操作');
        }
        const now = new Date().toISOString();
        const result = db.prepare(`
          UPDATE change_proposals
          SET status = 'ignored', updated_at = ?, resolved_at = ?
          WHERE id = ? AND status = 'pending'
        `).run(now, now, id);
        if (result.changes !== 1) {
          throw new RepositoryError('CONFLICT', '该变更建议已处理，不能重复操作');
        }
        return get(id);
      });
    },
  };
}
