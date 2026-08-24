import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Interview, InterviewReviewSnapshot } from '../../shared/domain';
import {
  interviewInputSchema,
  interviewReviewSnapshotSchema,
  interviewSummarySchema,
  interviewUpdateSchema,
} from '../../shared/schemas';
import {
  json,
  notFound,
  nullableText,
  RepositoryError,
  row,
  text,
} from './common';

export type InterviewInput = Omit<
  Interview,
  'id' | 'summary' | 'reviewSnapshot' | 'createdAt' | 'updatedAt'
> & { stageId?: string | null };

export function decodeInterviewRow(value: unknown): Interview {
  const data = row(value, 'interview');
  let reviewSnapshot: Interview['reviewSnapshot'] = { status: 'none' };
  if (data.review_snapshot_json !== null) {
    try {
      reviewSnapshot = {
        status: 'valid',
        snapshot: interviewReviewSnapshotSchema.parse(json(
          data.review_snapshot_json,
          'review_snapshot_json',
        )),
      };
    } catch {
      reviewSnapshot = { status: 'invalid' };
    }
  }
  return {
    id: text(data.id, 'id'),
    positionId: text(data.position_id, 'position_id'),
    stageId: nullableText(data.stage_id, 'stage_id'),
    roundName: text(data.round_name, 'round_name'),
    interviewDate: nullableText(data.interview_date, 'interview_date'),
    transcript: text(data.transcript, 'transcript'),
    personalNotes: text(data.personal_notes, 'personal_notes'),
    summary: nullableText(data.summary, 'summary'),
    reviewSnapshot,
    feedbackResult: nullableText(data.feedback_result, 'feedback_result'),
    createdAt: text(data.created_at, 'created_at'),
    updatedAt: text(data.updated_at, 'updated_at'),
  };
}

export interface InterviewsRepository {
  create(input: InterviewInput): Interview;
  update(id: string, input: InterviewInput): Interview;
  get(id: string): Interview;
  listByPosition(positionId: string): Interview[];
  saveSummary(id: string, summary: string): Interview;
  saveReview(id: string, summary: string, snapshot: InterviewReviewSnapshot): Interview;
}

export function createInterviewsRepository(db: DatabaseSync): InterviewsRepository {
  const get = (id: string): Interview => {
    const value = db.prepare('SELECT * FROM interviews WHERE id = ?').get(id);
    if (value === undefined) notFound('Interview', id);
    return decodeInterviewRow(value);
  };
  const write = (id: string, input: InterviewInput, create: boolean): Interview => {
    const parsed = (create ? interviewInputSchema : interviewUpdateSchema).parse(input);
    if (parsed.stageId !== null) {
      const stage = db.prepare(`
        SELECT id FROM process_stages WHERE id = ? AND position_id = ?
      `).get(parsed.stageId, parsed.positionId);
      if (stage === undefined) {
        throw new RepositoryError('VALIDATION_ERROR', '面试流程节点必须属于同一岗位。');
      }
    }
    const now = new Date().toISOString();
    if (create) {
      db.prepare(`
        INSERT INTO interviews (
          id, position_id, stage_id, round_name, interview_date, transcript, personal_notes,
          summary, review_snapshot_json, feedback_result, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        parsed.positionId,
        parsed.stageId,
        parsed.roundName,
        parsed.interviewDate,
        parsed.transcript,
        parsed.personalNotes,
        null,
        null,
        parsed.feedbackResult,
        now,
        now,
      );
    } else {
      const result = db.prepare(`
        UPDATE interviews
        SET position_id = ?, stage_id = ?, round_name = ?, interview_date = ?, transcript = ?,
            personal_notes = ?, feedback_result = ?, updated_at = ?
        WHERE id = ? AND review_snapshot_json IS NULL
      `).run(
        parsed.positionId,
        parsed.stageId,
        parsed.roundName,
        parsed.interviewDate,
        parsed.transcript,
        parsed.personalNotes,
        parsed.feedbackResult,
        now,
        id,
      );
      if (result.changes !== 1) {
        if (db.prepare('SELECT id FROM interviews WHERE id = ?').get(id) === undefined) {
          notFound('Interview', id);
        }
        throw new RepositoryError(
          'CONFLICT',
          '已完成复盘的面试记录不能修改，请新建补充记录。',
        );
      }
    }
    return get(id);
  };
  return {
    create(input) {
      return write(randomUUID(), input, true);
    },
    update(id, input) {
      return write(id, input, false);
    },
    get,
    listByPosition(positionId) {
      return db.prepare(`
        SELECT * FROM interviews
        WHERE position_id = ? ORDER BY interview_date DESC, created_at DESC
      `).all(positionId).map(decodeInterviewRow);
    },
    saveSummary(id, summary) {
      const parsed = interviewSummarySchema.parse(summary);
      const result = db.prepare(`
        UPDATE interviews SET summary = ?, updated_at = ?
        WHERE id = ? AND review_snapshot_json IS NULL
      `)
        .run(parsed, new Date().toISOString(), id);
      if (result.changes !== 1) {
        if (db.prepare('SELECT id FROM interviews WHERE id = ?').get(id) === undefined) {
          notFound('Interview', id);
        }
        throw new RepositoryError(
          'CONFLICT',
          '已完成复盘的面试记录不能修改，请新建补充记录。',
        );
      }
      return get(id);
    },
    saveReview(id, summary, snapshot) {
      const parsedSummary = interviewSummarySchema.parse(summary);
      const parsedSnapshot = interviewReviewSnapshotSchema.parse(snapshot);
      const result = db.prepare(`
        UPDATE interviews
        SET summary = ?, review_snapshot_json = ?, updated_at = ?
        WHERE id = ? AND review_snapshot_json IS NULL
      `).run(
        parsedSummary,
        JSON.stringify(parsedSnapshot),
        new Date().toISOString(),
        id,
      );
      if (result.changes !== 1) {
        if (db.prepare('SELECT id FROM interviews WHERE id = ?').get(id) === undefined) {
          notFound('Interview', id);
        }
        throw new RepositoryError(
          'CONFLICT',
          '已完成复盘的面试记录不能修改，请新建补充记录。',
        );
      }
      return get(id);
    },
  };
}
