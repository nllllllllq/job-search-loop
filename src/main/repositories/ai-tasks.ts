import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AiTask, AiTaskSafeError } from '../../shared/domain';
import { aiTaskSafeErrorSchema, aiTaskSchema } from '../../shared/schemas';
import { RepositoryError, notFound, nullableText, row, text, transaction } from './common';

function sanitizeDiagnosticMessage(message: string): string {
  if (
    /\b(?:authorization|proxy-authorization|api[-_ ]?key|request|prompt|input|content|assets?|attachments?|(?:raw\s*)?jd|job description)\b/i.test(message)
    || /[{}\[\]]/.test(message)
    || /\bdata:(?:image|application)\//i.test(message)
  ) {
    return 'AI service returned an unsafe diagnostic payload';
  }
  return message.split(/\r?\n/).map((line) => {
    if (/^\s*(authorization|proxy-authorization|api[-_ ]?key|prompt|jd|job description|request body|input|assets?)\s*[:=]/i.test(line)) {
      return '[redacted sensitive diagnostic content]';
    }
    return line
      .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
      .replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]');
  }).join('\n').slice(0, 2_000).trim();
}

function decodeTask(value: unknown): AiTask {
  const data = row(value, 'AI task');
  const errorJson = nullableText(data.safe_error_json, 'safe_error_json');
  const safeError = errorJson === null ? null : aiTaskSafeErrorSchema.parse(JSON.parse(errorJson));
  return aiTaskSchema.parse({
    id: text(data.id, 'id'),
    kind: text(data.kind, 'kind'),
    positionId: text(data.position_id, 'position_id'),
    status: text(data.status, 'status'),
    safeError,
    createdAt: text(data.created_at, 'created_at'),
    startedAt: nullableText(data.started_at, 'started_at'),
    updatedAt: text(data.updated_at, 'updated_at'),
  });
}

export interface AiTasksRepository {
  createPreparation(positionId: string): AiTask;
  get(id: string): AiTask;
  listByPosition(positionId: string): AiTask[];
  markRunning(id: string): AiTask;
  markSucceeded(id: string): AiTask;
  markFailed(id: string, safeError: AiTaskSafeError): AiTask;
  interruptRunningOnStartup(): number;
}

export function createAiTasksRepository(db: DatabaseSync): AiTasksRepository {
  const get = (id: string): AiTask => {
    const value = db.prepare('SELECT * FROM ai_tasks WHERE id = ?').get(id);
    if (value === undefined) notFound('AI task', id);
    return decodeTask(value);
  };
  const updateStatus = (
    id: string,
    status: AiTask['status'],
    allowedStatuses: AiTask['status'][],
    safeError: AiTaskSafeError | null,
    setStartedAt: boolean,
  ): AiTask => {
    const updatedAt = new Date().toISOString();
    const sanitizedError = safeError === null ? null : aiTaskSafeErrorSchema.parse({
      ...safeError,
      message: sanitizeDiagnosticMessage(safeError.message),
    });
    const result = db.prepare(`
      UPDATE ai_tasks
      SET status = ?, safe_error_json = ?, started_at = CASE WHEN ? THEN ? ELSE started_at END, updated_at = ?
      WHERE id = ? AND status IN (${allowedStatuses.map(() => '?').join(', ')})
    `).run(
      status,
      sanitizedError === null ? null : JSON.stringify(sanitizedError),
      setStartedAt ? 1 : 0,
      setStartedAt ? updatedAt : null,
      updatedAt,
      id,
      ...allowedStatuses,
    );
    if (result.changes === 0) {
      try { get(id); } catch (error) { throw error; }
      throw new RepositoryError('CONFLICT', `Invalid AI task transition for: ${id}`);
    }
    return get(id);
  };
  return {
    createPreparation(positionId) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO ai_tasks (id, kind, position_id, status, safe_error_json, created_at, started_at, updated_at)
        VALUES (?, 'preparation', ?, 'queued', NULL, ?, NULL, ?)
      `).run(id, positionId, now, now);
      return get(id);
    },
    get,
    listByPosition(positionId) {
      return db.prepare(`
        SELECT * FROM ai_tasks
        WHERE position_id = ?
        ORDER BY updated_at DESC, id DESC
      `).all(positionId).map(decodeTask);
    },
    markRunning(id) { return updateStatus(id, 'running', ['queued'], null, true); },
    markSucceeded(id) { return updateStatus(id, 'succeeded', ['running'], null, false); },
    markFailed(id, safeError) { return updateStatus(id, 'failed', ['running'], safeError, false); },
    interruptRunningOnStartup() {
      return transaction(db, () => Number(db.prepare(`
        UPDATE ai_tasks SET status = 'interrupted', updated_at = ?
        WHERE kind = 'preparation' AND status IN ('queued', 'running')
      `).run(new Date().toISOString()).changes));
    },
  };
}
