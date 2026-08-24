import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { CanonicalStage, EmailSyncEvent, EmailSyncStatus } from '../../shared/domain';
import { canonicalStageSchema } from '../../shared/schemas';
import { nullableText, row, text, transaction } from './common';

export interface EmailSyncEventInput {
  messageKey: string;
  subject: string;
  sender: string;
  receivedAt: string;
  status: EmailSyncStatus;
  positionId: string | null;
  canonicalStage: CanonicalStage | null;
  reason: string;
}

export interface EmailSyncRepository {
  getByMessageKey(messageKey: string): EmailSyncEvent | null;
  record(input: EmailSyncEventInput): EmailSyncEvent;
  listRecent(limit?: number): EmailSyncEvent[];
}

const EVENT_COLUMNS = `
  id, message_key, subject, sender, received_at, status,
  position_id, canonical_stage, reason, created_at
`;

function decodeEvent(value: unknown): EmailSyncEvent {
  const data = row(value, 'email sync event');
  const canonicalStage = nullableText(data.canonical_stage, 'canonical_stage');
  const positionId = nullableText(data.position_id, 'position_id');
  const status = text(data.status, 'status');
  if (status !== 'applied' && status !== 'pending') throw new Error('Invalid database field: status');
  return {
    id: text(data.id, 'id'),
    messageKey: text(data.message_key, 'message_key'),
    subject: text(data.subject, 'subject'),
    sender: text(data.sender, 'sender'),
    receivedAt: text(data.received_at, 'received_at'),
    status,
    positionId,
    canonicalStage: canonicalStage === null ? null : canonicalStageSchema.parse(canonicalStage),
    reason: text(data.reason, 'reason'),
    createdAt: text(data.created_at, 'created_at'),
  };
}

export function createEmailSyncRepository(db: DatabaseSync): EmailSyncRepository {
  const getByMessageKey = (messageKey: string): EmailSyncEvent | null => {
    const value = db.prepare(`
      SELECT ${EVENT_COLUMNS} FROM email_sync_events WHERE message_key = ?
    `).get(messageKey);
    return value === undefined ? null : decodeEvent(value);
  };

  return {
    getByMessageKey,

    record(input) {
      const existing = getByMessageKey(input.messageKey);
      if (existing !== null) return existing;
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      transaction(db, () => {
        db.prepare(`
          INSERT OR IGNORE INTO email_sync_events (
            id, message_key, subject, sender, received_at, status,
            position_id, canonical_stage, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          input.messageKey,
          input.subject,
          input.sender,
          input.receivedAt,
          input.status,
          input.positionId,
          input.canonicalStage,
          input.reason,
          createdAt,
        );
      });
      const value = getByMessageKey(input.messageKey);
      if (value === null) throw new Error('Email sync event was not persisted');
      return value;
    },

    listRecent(limit = 50) {
      const bounded = Math.max(1, Math.min(50, Math.trunc(limit)));
      return db.prepare(`
        SELECT ${EVENT_COLUMNS} FROM email_sync_events
        ORDER BY created_at DESC, id DESC LIMIT ?
      `).all(bounded).map(decodeEvent);
    },
  };
}
