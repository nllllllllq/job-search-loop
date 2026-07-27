import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_PROMPT_TEMPLATES } from '../shared/defaults';

export const CURRENT_SCHEMA_VERSION = 3;

const CREATE_SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    interest INTEGER NOT NULL CHECK (interest BETWEEN 1 AND 5),
    raw_jd TEXT NOT NULL,
    current_stage TEXT CHECK (current_stage IN ('interested', 'applied', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn') OR current_stage IS NULL),
    final_result TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS process_stages (
    id TEXT PRIMARY KEY,
    position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    canonical_stage TEXT NOT NULL CHECK (canonical_stage IN ('interested', 'applied', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn')),
    actual_date TEXT,
    expected_date TEXT,
    feedback TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL CHECK (order_index >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
  CREATE UNIQUE INDEX IF NOT EXISTS process_stages_position_order_idx ON process_stages(position_id, order_index);

  CREATE TABLE IF NOT EXISTS preparation_materials (
    id TEXT PRIMARY KEY,
    position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    raw_jd_snapshot TEXT NOT NULL,
    prompt_snapshot TEXT NOT NULL,
    assets_snapshot TEXT NOT NULL,
    model_snapshot TEXT NOT NULL,
    output_snapshot TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS interviews (
    id TEXT PRIMARY KEY,
    position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    round_name TEXT NOT NULL,
    interview_date TEXT,
    transcript TEXT NOT NULL,
    personal_notes TEXT NOT NULL DEFAULT '',
    summary TEXT,
    feedback_result TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    background TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    key_decisions TEXT NOT NULL DEFAULT '',
    outcomes_and_evidence TEXT NOT NULL DEFAULT '',
    reflections TEXT NOT NULL DEFAULT '',
    storytelling_versions TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('interviewer', 'candidate')),
    text TEXT NOT NULL,
    answer_draft TEXT NOT NULL DEFAULT '',
    project_ids_json TEXT NOT NULL DEFAULT '[]',
    capability_ids_json TEXT NOT NULL DEFAULT '[]',
    occurrence_count INTEGER NOT NULL DEFAULT 0 CHECK (occurrence_count >= 0),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS capabilities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    jd_frequency INTEGER NOT NULL DEFAULT 0 CHECK (jd_frequency >= 0),
    evidence TEXT NOT NULL DEFAULT '',
    gaps TEXT NOT NULL DEFAULT '',
    merged_into_id TEXT REFERENCES capabilities(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS capability_evidence (
    id TEXT PRIMARY KEY,
    capability_id TEXT NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
    position_id TEXT REFERENCES positions(id) ON DELETE CASCADE,
    interview_id TEXT REFERENCES interviews(id) ON DELETE CASCADE,
    evidence TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    position_id TEXT REFERENCES positions(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
    capability_id TEXT REFERENCES capabilities(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS change_proposals (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL CHECK (target_type IN ('project', 'question', 'capability', 'insight')),
    target_id TEXT,
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'merge')),
    payload_json TEXT NOT NULL,
    accepted_payload_json TEXT,
    rationale TEXT NOT NULL,
    position_id TEXT REFERENCES positions(id) ON DELETE SET NULL,
    interview_id TEXT REFERENCES interviews(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'ignored')) DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT
  ) STRICT;

  CREATE TABLE IF NOT EXISTS asset_versions (
    id TEXT PRIMARY KEY,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('project', 'question', 'capability', 'insight')),
    asset_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(asset_type, asset_id, version)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS prompt_templates (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL UNIQUE CHECK (kind IN ('preparation', 'interview-review', 'capability-analysis')),
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
`;

function migrateProjectJson(raw: unknown, field: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`Invalid legacy project JSON field: ${field}`);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid legacy project JSON field: ${field}`);
  }
  if (decoded === null || Array.isArray(decoded) || typeof decoded !== 'object') {
    throw new Error(`Invalid legacy project JSON field: ${field}`);
  }

  const payload = { ...(decoded as Record<string, unknown>) };
  const legacyOutcome = payload.outcomesAndEvidence;
  if (
    typeof legacyOutcome === 'string'
    && (typeof payload.outcome !== 'string' || payload.outcome === '')
  ) {
    payload.outcome = legacyOutcome;
  } else if (typeof payload.outcome !== 'string') {
    payload.outcome = '';
  }
  if (typeof payload.evidence !== 'string') payload.evidence = '';
  return JSON.stringify(payload);
}

function migrateLegacyProjectJson(db: DatabaseSync): void {
  const updateProposal = db.prepare(`
    UPDATE change_proposals
    SET payload_json = ?, accepted_payload_json = ?
    WHERE id = ?
  `);
  const proposals = db.prepare(`
    SELECT id, payload_json, accepted_payload_json
    FROM change_proposals WHERE target_type = 'project'
  `).all();
  for (const proposal of proposals) {
    const accepted = proposal.accepted_payload_json === null
      ? null
      : migrateProjectJson(
        proposal.accepted_payload_json,
        'change_proposals.accepted_payload_json',
      );
    updateProposal.run(
      migrateProjectJson(proposal.payload_json, 'change_proposals.payload_json'),
      accepted,
      proposal.id,
    );
  }

  const updateVersion = db.prepare(`
    UPDATE asset_versions SET snapshot_json = ? WHERE id = ?
  `);
  const versions = db.prepare(`
    SELECT id, snapshot_json FROM asset_versions WHERE asset_type = 'project'
  `).all();
  for (const version of versions) {
    updateVersion.run(
      migrateProjectJson(version.snapshot_json, 'asset_versions.snapshot_json'),
      version.id,
    );
  }
}

export function migrate(db: DatabaseSync): void {
  const version = readSchemaVersion(db);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported database schema version ${version}; current version is ${CURRENT_SCHEMA_VERSION}`,
    );
  }

  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');

  db.exec('BEGIN IMMEDIATE');
  try {
    if (version < 1) {
      db.exec(CREATE_SCHEMA_V1);
      const now = new Date().toISOString();
      const insertTemplate = db.prepare(`
        INSERT OR IGNORE INTO prompt_templates (id, kind, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const template of DEFAULT_PROMPT_TEMPLATES) {
        insertTemplate.run(template.id, template.kind, template.name, template.content, now, now);
      }
    }
    if (version < 2) {
      db.exec(`
        ALTER TABLE projects ADD COLUMN outcome TEXT NOT NULL DEFAULT '';
        ALTER TABLE projects ADD COLUMN evidence TEXT NOT NULL DEFAULT '';
        UPDATE projects SET outcome = outcomes_and_evidence
        WHERE outcome = '' AND outcomes_and_evidence <> '';
      `);
    }
    if (version < 3) migrateLegacyProjectJson(db);
    db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function readSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get();
  if (
    row === undefined
    || row === null
    || typeof row !== 'object'
    || !('user_version' in row)
    || typeof row.user_version !== 'number'
    || !Number.isSafeInteger(row.user_version)
    || row.user_version < 0
  ) {
    throw new Error('Unable to read database schema version from PRAGMA user_version');
  }
  return row.user_version;
}
