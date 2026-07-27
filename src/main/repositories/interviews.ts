import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Interview } from '../../shared/domain';
import {
  interviewInputSchema,
  interviewSummarySchema,
  interviewUpdateSchema,
} from '../../shared/schemas';
import { notFound, nullableText, row, text } from './common';

export type InterviewInput = Omit<Interview, 'id' | 'summary' | 'createdAt' | 'updatedAt'>;

function decodeInterview(value: unknown): Interview {
  const data = row(value, 'interview');
  return {
    id: text(data.id, 'id'),
    positionId: text(data.position_id, 'position_id'),
    roundName: text(data.round_name, 'round_name'),
    interviewDate: nullableText(data.interview_date, 'interview_date'),
    transcript: text(data.transcript, 'transcript'),
    personalNotes: text(data.personal_notes, 'personal_notes'),
    summary: nullableText(data.summary, 'summary'),
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
}

export function createInterviewsRepository(db: DatabaseSync): InterviewsRepository {
  const get = (id: string): Interview => {
    const value = db.prepare('SELECT * FROM interviews WHERE id = ?').get(id);
    if (value === undefined) notFound('Interview', id);
    return decodeInterview(value);
  };
  const write = (id: string, input: InterviewInput, create: boolean): Interview => {
    const parsed = (create ? interviewInputSchema : interviewUpdateSchema).parse(input);
    const now = new Date().toISOString();
    if (create) {
      db.prepare(`
        INSERT INTO interviews (
          id, position_id, round_name, interview_date, transcript, personal_notes,
          summary, feedback_result, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        parsed.positionId,
        parsed.roundName,
        parsed.interviewDate,
        parsed.transcript,
        parsed.personalNotes,
        null,
        parsed.feedbackResult,
        now,
        now,
      );
    } else {
      get(id);
      db.prepare(`
        UPDATE interviews
        SET position_id = ?, round_name = ?, interview_date = ?, transcript = ?,
            personal_notes = ?, feedback_result = ?, updated_at = ?
        WHERE id = ?
      `).run(
        parsed.positionId,
        parsed.roundName,
        parsed.interviewDate,
        parsed.transcript,
        parsed.personalNotes,
        parsed.feedbackResult,
        now,
        id,
      );
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
      `).all(positionId).map(decodeInterview);
    },
    saveSummary(id, summary) {
      get(id);
      const parsed = interviewSummarySchema.parse(summary);
      db.prepare('UPDATE interviews SET summary = ?, updated_at = ? WHERE id = ?')
        .run(parsed, new Date().toISOString(), id);
      return get(id);
    },
  };
}
