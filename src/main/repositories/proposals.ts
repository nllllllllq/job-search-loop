import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ChangeProposal,
  ChangeProposalInput,
  ProposalStatus,
  ProposalTarget,
} from '../../shared/domain';
import {
  capabilityPayloadSchema,
  changeProposalInputSchema,
  insightPayloadSchema,
  projectPayloadSchema,
  proposalOperationSchema,
  proposalStatusSchema,
  proposalTargetSchema,
  questionPayloadSchema,
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

function decodeProposal(value: unknown): ChangeProposal {
  const data = row(value, 'proposal');
  const targetType = proposalTargetSchema.parse(text(data.target_type, 'target_type'));
  const payload = parsePayload(targetType, json(data.payload_json, 'payload_json'));
  const acceptedValue = data.accepted_payload_json === null
    ? null
    : parsePayload(targetType, json(data.accepted_payload_json, 'accepted_payload_json'));
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
            evidence, reflections, storytelling_versions, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, value.name, value.background, value.goal, value.role, value.keyDecisions,
          value.outcome, value.evidence, value.reflections, value.storytellingVersions, now, now,
        );
      } else {
        db.prepare(`
          UPDATE projects SET name = ?, background = ?, goal = ?, role = ?,
            key_decisions = ?, outcome = ?, evidence = ?, reflections = ?,
            storytelling_versions = ?, updated_at = ? WHERE id = ?
        `).run(
          value.name, value.background, value.goal, value.role, value.keyDecisions,
          value.outcome, value.evidence, value.reflections, value.storytellingVersions, now, id,
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
  list(status?: ProposalStatus): ChangeProposal[];
  get(id: string): ChangeProposal;
  create(input: ChangeProposalInput): ChangeProposal;
  accept(id: string, editedPayload: unknown): ChangeProposal;
  ignore(id: string): ChangeProposal;
}

export function createProposalsRepository(db: DatabaseSync): ProposalsRepository {
  const get = (id: string): ChangeProposal => {
    const value = db.prepare('SELECT * FROM change_proposals WHERE id = ?').get(id);
    if (value === undefined) notFound('Proposal', id);
    return decodeProposal(value);
  };
  return {
    list(status) {
      if (status) {
        return db.prepare(`
          SELECT * FROM change_proposals WHERE status = ? ORDER BY created_at DESC
        `).all(proposalStatusSchema.parse(status)).map(decodeProposal);
      }
      return db.prepare('SELECT * FROM change_proposals ORDER BY created_at DESC')
        .all().map(decodeProposal);
    },
    get,
    create(input) {
      const parsed = changeProposalInputSchema.parse(input);
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO change_proposals (
          id, target_type, target_id, operation, payload_json, accepted_payload_json,
          rationale, position_id, interview_id, status, created_at, updated_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'pending', ?, ?, NULL)
      `).run(
        id,
        parsed.targetType,
        parsed.targetId,
        parsed.operation,
        JSON.stringify(parsed.payload),
        parsed.rationale,
        parsed.positionId,
        parsed.interviewId,
        now,
        now,
      );
      return get(id);
    },
    accept(id, editedPayload) {
      return transaction(db, () => {
        const proposal = get(id);
        if (proposal.status !== 'pending') {
          throw new RepositoryError('CONFLICT', '该变更建议已处理，不能重复操作');
        }
        const payload = parsePayload(proposal.targetType, editedPayload);
        const now = new Date().toISOString();
        let targetId = proposal.targetId;
        if (proposal.operation === 'create') {
          targetId = randomUUID();
          writeTarget(db, proposal.targetType, targetId, payload, true, now);
        } else {
          if (targetId === null) throw new Error('Proposal target ID is required');
          const previous = readTarget(db, proposal.targetType, targetId);
          const previousPayload = parsePayload(proposal.targetType, previous);
          if (JSON.stringify(previousPayload) !== JSON.stringify(payload)) {
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
      const proposal = get(id);
      if (proposal.status !== 'pending') {
        throw new RepositoryError('CONFLICT', '该变更建议已处理，不能重复操作');
      }
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE change_proposals
        SET status = 'ignored', updated_at = ?, resolved_at = ? WHERE id = ?
      `).run(now, now, id);
      return get(id);
    },
  };
}
