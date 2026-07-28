import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AssetVersion,
  Capability,
  CapabilityInput,
  CapabilityMergeResult,
  Insight,
  InsightInput,
  Project,
  ProjectInput,
  ProposalTarget,
  Question,
  QuestionInput,
} from '../../shared/domain';
import {
  capabilitySaveSchema,
  capabilityMergeSchema,
  insightSaveSchema,
  projectSaveSchema,
  proposalTargetSchema,
  questionSaveSchema,
  questionTypeSchema,
} from '../../shared/schemas';
import {
  integer,
  json,
  notFound,
  nullableText,
  RepositoryError,
  row,
  text,
  transaction,
} from './common';

export type SaveInput<T> = T & { id?: string };

function stringArray(value: unknown, field: string): string[] {
  const decoded = json(value, field);
  if (!Array.isArray(decoded) || decoded.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid JSON string array database field: ${field}`);
  }
  return decoded;
}

function decodeProject(value: unknown): Project {
  const data = row(value, 'project');
  return {
    id: text(data.id, 'id'),
    name: text(data.name, 'name'),
    background: text(data.background, 'background'),
    goal: text(data.goal, 'goal'),
    role: text(data.role, 'role'),
    keyDecisions: text(data.key_decisions, 'key_decisions'),
    outcome: text(data.outcome, 'outcome'),
    evidence: text(data.evidence, 'evidence'),
    reflections: text(data.reflections, 'reflections'),
    storytellingVersions: text(data.storytelling_versions, 'storytelling_versions'),
    unclassifiedNotes: text(data.unclassified_notes, 'unclassified_notes'),
    createdAt: text(data.created_at, 'created_at'),
    updatedAt: text(data.updated_at, 'updated_at'),
  };
}

function decodeQuestion(value: unknown): Question {
  const data = row(value, 'question');
  return {
    id: text(data.id, 'id'),
    type: questionTypeSchema.parse(text(data.type, 'type')),
    text: text(data.text, 'text'),
    answerDraft: text(data.answer_draft, 'answer_draft'),
    projectIds: stringArray(data.project_ids_json, 'project_ids_json'),
    capabilityIds: stringArray(data.capability_ids_json, 'capability_ids_json'),
    occurrenceCount: integer(data.occurrence_count, 'occurrence_count'),
    status: text(data.status, 'status'),
    createdAt: text(data.created_at, 'created_at'),
    updatedAt: text(data.updated_at, 'updated_at'),
  };
}

function decodeCapability(value: unknown): Capability {
  const data = row(value, 'capability');
  return {
    id: text(data.id, 'id'),
    name: text(data.name, 'name'),
    jdFrequency: integer(data.jd_frequency, 'jd_frequency'),
    evidence: text(data.evidence, 'evidence'),
    gaps: text(data.gaps, 'gaps'),
    mergedIntoId: nullableText(data.merged_into_id, 'merged_into_id'),
    createdAt: text(data.created_at, 'created_at'),
    updatedAt: text(data.updated_at, 'updated_at'),
  };
}

function decodeInsight(value: unknown): Insight {
  const data = row(value, 'insight');
  return {
    id: text(data.id, 'id'),
    title: text(data.title, 'title'),
    content: text(data.content, 'content'),
    positionId: nullableText(data.position_id, 'position_id'),
    projectId: nullableText(data.project_id, 'project_id'),
    questionId: nullableText(data.question_id, 'question_id'),
    capabilityId: nullableText(data.capability_id, 'capability_id'),
    createdAt: text(data.created_at, 'created_at'),
    updatedAt: text(data.updated_at, 'updated_at'),
  };
}

function decodeVersion(value: unknown): AssetVersion {
  const data = row(value, 'asset version');
  return {
    id: text(data.id, 'id'),
    assetType: proposalTargetSchema.parse(text(data.asset_type, 'asset_type')),
    assetId: text(data.asset_id, 'asset_id'),
    version: integer(data.version, 'version'),
    snapshot: text(data.snapshot_json, 'snapshot_json'),
    createdAt: text(data.created_at, 'created_at'),
  };
}

function insertVersion(
  db: DatabaseSync,
  assetType: ProposalTarget,
  assetId: string,
  snapshot: unknown,
  now: string,
): void {
  const versionRow = row(db.prepare(`
    SELECT COALESCE(MAX(version), 0) + 1 AS next_version
    FROM asset_versions WHERE asset_type = ? AND asset_id = ?
  `).get(assetType, assetId), 'asset version number');
  const version = integer(versionRow.next_version, 'next_version');
  db.prepare(`
    INSERT INTO asset_versions (id, asset_type, asset_id, version, snapshot_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), assetType, assetId, version, JSON.stringify(snapshot), now);
}

function sameProjectNarrative(previous: Project, input: ProjectInput): boolean {
  return previous.name === input.name
    && previous.background === input.background
    && previous.goal === input.goal
    && previous.role === input.role
    && previous.keyDecisions === input.keyDecisions
    && previous.outcome === input.outcome
    && previous.evidence === input.evidence
    && previous.reflections === input.reflections
    && previous.storytellingVersions === input.storytellingVersions
    && previous.unclassifiedNotes === (input.unclassifiedNotes ?? '');
}

function requireExistingIds(
  db: DatabaseSync,
  table: 'projects' | 'capabilities',
  ids: string[],
): void {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return;
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const value = row(db.prepare(`
    SELECT COUNT(*) AS count FROM ${table} WHERE id IN (${placeholders})
  `).get(...uniqueIds), `${table} references`);
  if (integer(value.count, 'count') !== uniqueIds.length) {
    throw new RepositoryError(
      'VALIDATION_ERROR',
      `Referenced ${table} record does not exist`,
    );
  }
}

function validateQuestionReferences(
  db: DatabaseSync,
  projectIds: string[],
  capabilityIds: string[],
): void {
  requireExistingIds(db, 'projects', projectIds);
  requireExistingIds(db, 'capabilities', capabilityIds);
}

function mergeParagraphs(primary: string, secondary: string): string {
  const paragraphs = [primary, secondary]
    .flatMap((value) => value.split(/\n\s*\n/))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(paragraphs)].join('\n\n');
}

function replaceCapabilityId(ids: string[], sourceId: string, targetId: string): string[] {
  const rewritten = ids.map((id) => id === sourceId ? targetId : id);
  return rewritten.filter((id, index) => rewritten.indexOf(id) === index);
}

export interface AssetsRepository {
  listProjects(): Project[];
  getProject(id: string): Project;
  saveProject(input: SaveInput<ProjectInput>): Project;
  listQuestions(type?: QuestionInput['type']): Question[];
  getQuestion(id: string): Question;
  saveQuestion(input: SaveInput<QuestionInput>): Question;
  listCapabilities(): Capability[];
  getCapability(id: string): Capability;
  saveCapability(input: SaveInput<CapabilityInput>): Capability;
  mergeCapabilities(sourceId: string, targetId: string): CapabilityMergeResult;
  listInsights(): Insight[];
  getInsight(id: string): Insight;
  saveInsight(input: SaveInput<InsightInput>): Insight;
  listVersions(type: ProposalTarget, id: string): AssetVersion[];
}

export function createAssetsRepository(db: DatabaseSync): AssetsRepository {
  const getProject = (id: string): Project => {
    const value = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (value === undefined) notFound('Project', id);
    return decodeProject(value);
  };
  const getQuestion = (id: string): Question => {
    const value = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
    if (value === undefined) notFound('Question', id);
    return decodeQuestion(value);
  };
  const getCapability = (id: string): Capability => {
    const value = db.prepare('SELECT * FROM capabilities WHERE id = ?').get(id);
    if (value === undefined) notFound('Capability', id);
    return decodeCapability(value);
  };
  const getInsight = (id: string): Insight => {
    const value = db.prepare('SELECT * FROM insights WHERE id = ?').get(id);
    if (value === undefined) notFound('Insight', id);
    return decodeInsight(value);
  };

  return {
    listProjects() {
      return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC')
        .all().map(decodeProject);
    },
    getProject,
    saveProject(input) {
      const parsed = projectSaveSchema.parse(input);
      return transaction(db, () => {
        const now = new Date().toISOString();
        const id = parsed.id ?? randomUUID();
        if (parsed.id !== undefined) {
          const previous = getProject(id);
          if (sameProjectNarrative(previous, parsed)) return previous;
          insertVersion(db, 'project', id, previous, now);
          db.prepare(`
            UPDATE projects SET name = ?, background = ?, goal = ?, role = ?,
              key_decisions = ?, outcome = ?, evidence = ?, reflections = ?,
              storytelling_versions = ?, unclassified_notes = ?, updated_at = ? WHERE id = ?
          `).run(
            parsed.name,
            parsed.background,
            parsed.goal,
            parsed.role,
            parsed.keyDecisions,
            parsed.outcome,
            parsed.evidence,
            parsed.reflections,
            parsed.storytellingVersions,
            parsed.unclassifiedNotes,
            now,
            id,
          );
        } else {
          db.prepare(`
            INSERT INTO projects (
              id, name, background, goal, role, key_decisions, outcome,
              evidence, reflections, storytelling_versions, unclassified_notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            parsed.name,
            parsed.background,
            parsed.goal,
            parsed.role,
            parsed.keyDecisions,
            parsed.outcome,
            parsed.evidence,
            parsed.reflections,
            parsed.storytellingVersions,
            parsed.unclassifiedNotes,
            now,
            now,
          );
        }
        return getProject(id);
      });
    },

    listQuestions(type) {
      if (type) {
        const parsedType = questionTypeSchema.parse(type);
        return db.prepare(`
          SELECT * FROM questions WHERE type = ? ORDER BY updated_at DESC, created_at DESC
        `).all(parsedType).map(decodeQuestion);
      }
      return db.prepare('SELECT * FROM questions ORDER BY updated_at DESC, created_at DESC')
        .all().map(decodeQuestion);
    },
    getQuestion,
    saveQuestion(input) {
      const parsed = questionSaveSchema.parse(input);
      return transaction(db, () => {
        validateQuestionReferences(db, parsed.projectIds, parsed.capabilityIds);
        const now = new Date().toISOString();
        const id = parsed.id ?? randomUUID();
        if (parsed.id !== undefined) {
          const previous = getQuestion(id);
          insertVersion(db, 'question', id, previous, now);
          db.prepare(`
            UPDATE questions SET type = ?, text = ?, answer_draft = ?,
              project_ids_json = ?, capability_ids_json = ?, occurrence_count = ?,
              status = ?, updated_at = ? WHERE id = ?
          `).run(
            parsed.type,
            parsed.text,
            parsed.answerDraft,
            JSON.stringify(parsed.projectIds),
            JSON.stringify(parsed.capabilityIds),
            parsed.occurrenceCount,
            parsed.status,
            now,
            id,
          );
        } else {
          db.prepare(`
            INSERT INTO questions (
              id, type, text, answer_draft, project_ids_json, capability_ids_json,
              occurrence_count, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            parsed.type,
            parsed.text,
            parsed.answerDraft,
            JSON.stringify(parsed.projectIds),
            JSON.stringify(parsed.capabilityIds),
            parsed.occurrenceCount,
            parsed.status,
            now,
            now,
          );
        }
        return getQuestion(id);
      });
    },

    listCapabilities() {
      return db.prepare(`
        SELECT * FROM capabilities
        WHERE merged_into_id IS NULL
        ORDER BY updated_at DESC, created_at DESC
      `)
        .all().map(decodeCapability);
    },
    getCapability,
    saveCapability(input) {
      const parsed = capabilitySaveSchema.parse(input);
      return transaction(db, () => {
        const now = new Date().toISOString();
        const id = parsed.id ?? randomUUID();
        if (parsed.id !== undefined) {
          const previous = getCapability(id);
          insertVersion(db, 'capability', id, previous, now);
          db.prepare(`
            UPDATE capabilities SET name = ?, jd_frequency = ?, evidence = ?, gaps = ?,
              merged_into_id = ?, updated_at = ? WHERE id = ?
          `).run(
            parsed.name,
            parsed.jdFrequency,
            parsed.evidence,
            parsed.gaps,
            parsed.mergedIntoId,
            now,
            id,
          );
        } else {
          db.prepare(`
            INSERT INTO capabilities (
              id, name, jd_frequency, evidence, gaps, merged_into_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            parsed.name,
            parsed.jdFrequency,
            parsed.evidence,
            parsed.gaps,
            parsed.mergedIntoId,
            now,
            now,
          );
        }
        return getCapability(id);
      });
    },
    mergeCapabilities(sourceId, targetId) {
      const parsed = capabilityMergeSchema.parse({ sourceId, targetId });
      return transaction(db, () => {
        if (parsed.sourceId === parsed.targetId) {
          throw new RepositoryError(
            'VALIDATION_ERROR',
            'A capability cannot be merged into itself',
          );
        }
        const source = getCapability(parsed.sourceId);
        const target = getCapability(parsed.targetId);
        if (source.mergedIntoId !== null || target.mergedIntoId !== null) {
          throw new RepositoryError(
            'CONFLICT',
            'Capability merges require two active capabilities',
          );
        }

        const now = new Date().toISOString();
        insertVersion(db, 'capability', source.id, source, now);
        insertVersion(db, 'capability', target.id, target, now);

        const questionRows = db.prepare(
          'SELECT id, capability_ids_json FROM questions ORDER BY created_at, id',
        ).all();
        for (const value of questionRows) {
          const data = row(value, 'question capability references');
          const ids = stringArray(data.capability_ids_json, 'capability_ids_json');
          if (!ids.includes(source.id)) continue;
          db.prepare(`
            UPDATE questions SET capability_ids_json = ?, updated_at = ? WHERE id = ?
          `).run(
            JSON.stringify(replaceCapabilityId(ids, source.id, target.id)),
            now,
            text(data.id, 'id'),
          );
        }

        db.prepare(`
          UPDATE insights SET capability_id = ?, updated_at = ? WHERE capability_id = ?
        `).run(target.id, now, source.id);
        db.prepare(`
          UPDATE capability_evidence SET capability_id = ? WHERE capability_id = ?
        `).run(target.id, source.id);
        db.prepare(`
          UPDATE capabilities SET merged_into_id = ?, updated_at = ?
          WHERE merged_into_id = ?
        `).run(target.id, now, source.id);
        db.prepare(`
          UPDATE capabilities
          SET jd_frequency = ?, evidence = ?, gaps = ?, updated_at = ?
          WHERE id = ?
        `).run(
          target.jdFrequency + source.jdFrequency,
          mergeParagraphs(target.evidence, source.evidence),
          mergeParagraphs(target.gaps, source.gaps),
          now,
          target.id,
        );
        db.prepare(`
          UPDATE capabilities SET merged_into_id = ?, updated_at = ? WHERE id = ?
        `).run(target.id, now, source.id);

        return {
          source: getCapability(source.id),
          target: getCapability(target.id),
        };
      });
    },

    listInsights() {
      return db.prepare('SELECT * FROM insights ORDER BY updated_at DESC, created_at DESC')
        .all().map(decodeInsight);
    },
    getInsight,
    saveInsight(input) {
      const parsed = insightSaveSchema.parse(input);
      return transaction(db, () => {
        const now = new Date().toISOString();
        const id = parsed.id ?? randomUUID();
        if (parsed.id !== undefined) {
          const previous = getInsight(id);
          insertVersion(db, 'insight', id, previous, now);
          db.prepare(`
            UPDATE insights SET title = ?, content = ?, position_id = ?, project_id = ?,
              question_id = ?, capability_id = ?, updated_at = ? WHERE id = ?
          `).run(
            parsed.title,
            parsed.content,
            parsed.positionId,
            parsed.projectId,
            parsed.questionId,
            parsed.capabilityId,
            now,
            id,
          );
        } else {
          db.prepare(`
            INSERT INTO insights (
              id, title, content, position_id, project_id, question_id, capability_id,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            parsed.title,
            parsed.content,
            parsed.positionId,
            parsed.projectId,
            parsed.questionId,
            parsed.capabilityId,
            now,
            now,
          );
        }
        return getInsight(id);
      });
    },

    listVersions(type, id) {
      return db.prepare(`
        SELECT * FROM asset_versions
        WHERE asset_type = ? AND asset_id = ? ORDER BY version DESC
      `).all(proposalTargetSchema.parse(type), id).map(decodeVersion);
    },
  };
}

export const assetRepositoryInternals = {
  decodeProject,
  decodeQuestion,
  decodeCapability,
  decodeInsight,
  insertVersion,
  validateQuestionReferences,
  mergeParagraphs,
  replaceCapabilityId,
};
