import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_PROCESS_STAGES } from '../../shared/defaults';
import type {
  CanonicalStage,
  Position,
  PositionDetail,
  PositionInput,
  PositionListItem,
  ProcessStage,
  ProcessStageInput,
} from '../../shared/domain';
import {
  canonicalStageSchema,
  positionInputSchema,
  processStageInputSchema,
} from '../../shared/schemas';
import {
  integer,
  notFound,
  nullableText,
  RepositoryError,
  row,
  text,
  transaction,
} from './common';
import { decodeInterviewRow } from './interviews';

const POSITION_COLUMNS = `
  id, company, title, location, interest, raw_jd, current_stage, final_result, created_at, updated_at
`;
const STAGE_COLUMNS = `
  id, position_id, name, canonical_stage, actual_date, expected_date,
  feedback, notes, order_index, created_at, updated_at
`;

function decodePosition(value: unknown): Position {
  const data = row(value, 'position');
  const interest = integer(data.interest, 'interest');
  if (interest < 1 || interest > 5) throw new Error('Invalid database field: interest');
  const currentStageValue = nullableText(data.current_stage, 'current_stage');
  return {
    id: text(data.id, 'id'),
    company: text(data.company, 'company'),
    title: text(data.title, 'title'),
    location: text(data.location, 'location'),
    interest: interest as Position['interest'],
    rawJd: text(data.raw_jd, 'raw_jd'),
    currentStage: currentStageValue === null
      ? null
      : canonicalStageSchema.parse(currentStageValue),
    finalResult: nullableText(data.final_result, 'final_result'),
    createdAt: text(data.created_at, 'created_at'),
    updatedAt: text(data.updated_at, 'updated_at'),
  };
}

function decodeStage(value: unknown): ProcessStage {
  const data = row(value, 'process stage');
  return {
    id: text(data.id, 'id'),
    positionId: text(data.position_id, 'position_id'),
    name: text(data.name, 'name'),
    canonicalStage: canonicalStageSchema.parse(text(data.canonical_stage, 'canonical_stage')),
    actualDate: nullableText(data.actual_date, 'actual_date'),
    expectedDate: nullableText(data.expected_date, 'expected_date'),
    feedback: text(data.feedback, 'feedback'),
    notes: text(data.notes, 'notes'),
    orderIndex: integer(data.order_index, 'order_index'),
    createdAt: text(data.created_at, 'created_at'),
    updatedAt: text(data.updated_at, 'updated_at'),
  };
}

export interface PositionsRepository {
  create(input: PositionInput): Position;
  update(id: string, input: PositionInput): Position;
  get(id: string): Position;
  getDetail(id: string): PositionDetail;
  list(filter?: { query?: string; stage?: CanonicalStage }): PositionListItem[];
  remove(id: string): void;
  listStages(positionId: string): ProcessStage[];
  upsertStage(input: ProcessStageInput & { id?: string }): ProcessStage;
  reorderStages(positionId: string, orderedIds: string[]): ProcessStage[];
}

export function createPositionsRepository(db: DatabaseSync): PositionsRepository {
  const get = (id: string): Position => {
    const value = db.prepare(`SELECT ${POSITION_COLUMNS} FROM positions WHERE id = ?`).get(id);
    if (value === undefined) notFound('Position', id);
    return decodePosition(value);
  };

  const listStages = (positionId: string): ProcessStage[] => {
    get(positionId);
    return db.prepare(`
      SELECT ${STAGE_COLUMNS} FROM process_stages
      WHERE position_id = ? ORDER BY order_index, created_at, id
    `).all(positionId).map(decodeStage);
  };

  // Current stage is the furthest ordered stage with an actual date. Before any
  // progress is recorded, it is the first ordered stage (normally "interested").
  const refreshCurrentStage = (positionId: string, now: string): void => {
    const stages = db.prepare(`
      SELECT canonical_stage, actual_date FROM process_stages
      WHERE position_id = ? ORDER BY order_index
    `).all(positionId).map((value) => {
      const data = row(value, 'process stage');
      return {
        canonicalStage: canonicalStageSchema.parse(text(data.canonical_stage, 'canonical_stage')),
        actualDate: nullableText(data.actual_date, 'actual_date'),
      };
    });
    const current = [...stages].reverse().find((stage) => stage.actualDate !== null) ?? stages[0];
    db.prepare('UPDATE positions SET current_stage = ?, updated_at = ? WHERE id = ?')
      .run(current?.canonicalStage ?? null, now, positionId);
  };

  const reorderInsideTransaction = (
    positionId: string,
    orderedIds: string[],
    now: string,
  ): ProcessStage[] => {
    const existing = db.prepare(`
      SELECT ${STAGE_COLUMNS} FROM process_stages
      WHERE position_id = ? ORDER BY order_index
    `).all(positionId).map(decodeStage);
    const existingIds = new Set(existing.map((stage) => stage.id));
    const orderedSet = new Set(orderedIds);
    if (
      orderedIds.length !== existing.length
      || orderedSet.size !== orderedIds.length
      || orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new RepositoryError(
        'VALIDATION_ERROR',
        '流程阶段顺序必须完整且不能重复',
      );
    }
    db.prepare('UPDATE process_stages SET order_index = order_index + 1000000 WHERE position_id = ?')
      .run(positionId);
    const updateOrder = db.prepare(
      'UPDATE process_stages SET order_index = ?, updated_at = ? WHERE id = ? AND position_id = ?',
    );
    orderedIds.forEach((id, index) => updateOrder.run(index, now, id, positionId));
    refreshCurrentStage(positionId, now);
    return db.prepare(`
      SELECT ${STAGE_COLUMNS} FROM process_stages
      WHERE position_id = ? ORDER BY order_index
    `).all(positionId).map(decodeStage);
  };

  return {
    create(input) {
      const parsed = positionInputSchema.parse(input);
      return transaction(db, () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO positions (${POSITION_COLUMNS})
          VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        `).run(
          id,
          parsed.company,
          parsed.title,
          parsed.location,
          parsed.interest,
          parsed.rawJd,
          DEFAULT_PROCESS_STAGES[0]?.canonicalStage ?? null,
          now,
          now,
        );
        const insertStage = db.prepare(`
          INSERT INTO process_stages (${STAGE_COLUMNS})
          VALUES (?, ?, ?, ?, NULL, NULL, '', '', ?, ?, ?)
        `);
        for (const stage of DEFAULT_PROCESS_STAGES) {
          insertStage.run(
            randomUUID(),
            id,
            stage.name,
            stage.canonicalStage,
            stage.orderIndex,
            now,
            now,
          );
        }
        return get(id);
      });
    },

    update(id, input) {
      const parsed = positionInputSchema.parse(input);
      get(id);
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE positions
        SET company = ?, title = ?, location = ?, interest = ?, raw_jd = ?, updated_at = ?
        WHERE id = ?
      `).run(
        parsed.company,
        parsed.title,
        parsed.location,
        parsed.interest,
        parsed.rawJd,
        now,
        id,
      );
      return get(id);
    },

    get,

    getDetail(id) {
      const position = get(id);
      const stages = listStages(id);
      const interviews = db.prepare(`
        SELECT * FROM interviews
        WHERE position_id = ? ORDER BY interview_date DESC, created_at DESC
      `).all(id).map(decodeInterviewRow);
      return { ...position, stages, interviews };
    },

    list(filter = {}) {
      const clauses: string[] = [];
      const parameters: string[] = [];
      if (filter.query?.trim()) {
        clauses.push("(company LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\' OR raw_jd LIKE ? ESCAPE '\\')");
        const escaped = filter.query.trim().replace(/[\\%_]/g, '\\$&');
        parameters.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
      }
      if (filter.stage) {
        clauses.push('current_stage = ?');
        parameters.push(canonicalStageSchema.parse(filter.stage));
      }
      const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
      return db.prepare(`
        SELECT ${POSITION_COLUMNS} FROM positions ${where}
        ORDER BY updated_at DESC, created_at DESC
      `).all(...parameters).map((value): PositionListItem => {
        const position = decodePosition(value);
        return {
          id: position.id,
          company: position.company,
          title: position.title,
          location: position.location,
          interest: position.interest,
          currentStage: position.currentStage,
          finalResult: position.finalResult,
          updatedAt: position.updatedAt,
        };
      });
    },

    remove(id) {
      const result = db.prepare('DELETE FROM positions WHERE id = ?').run(id);
      if (result.changes === 0) notFound('Position', id);
    },

    listStages,

    upsertStage(input) {
      const parsed = processStageInputSchema.parse(input);
      get(parsed.positionId);
      return transaction(db, () => {
        const now = new Date().toISOString();
        const existing = db.prepare(`
          SELECT ${STAGE_COLUMNS} FROM process_stages
          WHERE position_id = ? ORDER BY order_index
        `).all(parsed.positionId).map(decodeStage);
        let id = input.id;
        if (id) {
          if (!existing.some((stage) => stage.id === id)) notFound('Process stage', id);
          db.prepare(`
            UPDATE process_stages
            SET name = ?, canonical_stage = ?, actual_date = ?, expected_date = ?,
                feedback = ?, notes = ?, updated_at = ?
            WHERE id = ? AND position_id = ?
          `).run(
            parsed.name,
            parsed.canonicalStage,
            parsed.actualDate,
            parsed.expectedDate,
            parsed.feedback,
            parsed.notes,
            now,
            id,
            parsed.positionId,
          );
        } else {
          id = randomUUID();
          const temporaryOrder = existing.length === 0
            ? 0
            : Math.max(...existing.map((stage) => stage.orderIndex)) + 1;
          db.prepare(`
            INSERT INTO process_stages (${STAGE_COLUMNS})
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            parsed.positionId,
            parsed.name,
            parsed.canonicalStage,
            parsed.actualDate,
            parsed.expectedDate,
            parsed.feedback,
            parsed.notes,
            temporaryOrder,
            now,
            now,
          );
        }
        const orderedIds = existing.map((stage) => stage.id).filter((stageId) => stageId !== id);
        orderedIds.splice(Math.min(parsed.orderIndex, orderedIds.length), 0, id);
        reorderInsideTransaction(parsed.positionId, orderedIds, now);
        const value = db.prepare(`SELECT ${STAGE_COLUMNS} FROM process_stages WHERE id = ?`).get(id);
        if (value === undefined) notFound('Process stage', id);
        return decodeStage(value);
      });
    },

    reorderStages(positionId, orderedIds) {
      get(positionId);
      return transaction(db, () => reorderInsideTransaction(
        positionId,
        orderedIds,
        new Date().toISOString(),
      ));
    },
  };
}
