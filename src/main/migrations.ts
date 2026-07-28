import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_PROMPT_TEMPLATES } from '../shared/defaults';

export const CURRENT_SCHEMA_VERSION = 5;

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
  if (typeof payload.unclassifiedNotes !== 'string') payload.unclassifiedNotes = '';
  if (
    typeof payload.storytellingVersions !== 'string'
    && typeof payload.storytelling_versions === 'string'
  ) {
    payload.storytellingVersions = payload.storytelling_versions;
  }
  delete payload.outcomesAndEvidence;
  delete payload.storytelling_versions;
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

function migrateNestedProjectSnapshots(db: DatabaseSync): void {
  if (hasTable(db, 'preparation_materials')) {
    const update = db.prepare(
      'UPDATE preparation_materials SET assets_snapshot = ? WHERE id = ?',
    );
    for (const item of db.prepare(
      'SELECT id, assets_snapshot FROM preparation_materials',
    ).all()) {
      try {
        if (typeof item.assets_snapshot !== 'string') continue;
        const decoded = JSON.parse(item.assets_snapshot) as unknown;
        if (
          decoded === null
          || Array.isArray(decoded)
          || typeof decoded !== 'object'
          || !('projects' in decoded)
          || !Array.isArray(decoded.projects)
        ) continue;
        const migrated = {
          ...(decoded as Record<string, unknown>),
          projects: decoded.projects.map((project, index) => JSON.parse(
            migrateProjectJson(
              JSON.stringify(project),
              `preparation_materials.assets_snapshot.projects[${index}]`,
            ),
          )),
        };
        update.run(JSON.stringify(migrated), item.id);
      } catch {
        // Preserve unreadable history; readable rows still migrate.
      }
    }
  }

  if (hasTable(db, 'interviews')) {
    const update = db.prepare(
      'UPDATE interviews SET review_snapshot_json = ? WHERE id = ?',
    );
    for (const item of db.prepare(`
      SELECT id, review_snapshot_json FROM interviews
      WHERE review_snapshot_json IS NOT NULL
    `).all()) {
      try {
        if (typeof item.review_snapshot_json !== 'string') continue;
        const decoded = JSON.parse(item.review_snapshot_json) as unknown;
        if (
          decoded === null
          || Array.isArray(decoded)
          || typeof decoded !== 'object'
        ) continue;
        const snapshot = decoded as Record<string, unknown>;
        const output = snapshot.output;
        if (
          output === null
          || Array.isArray(output)
          || typeof output !== 'object'
          || !('proposals' in output)
          || !Array.isArray(output.proposals)
        ) continue;
        const proposals = output.proposals.map((proposal, index) => {
          if (
            proposal === null
            || Array.isArray(proposal)
            || typeof proposal !== 'object'
          ) return proposal;
          const record = proposal as Record<string, unknown>;
          if (record.targetType !== 'project') return proposal;
          return {
            ...record,
            payload: JSON.parse(migrateProjectJson(
              JSON.stringify(record.payload),
              `interviews.review_snapshot_json.output.proposals[${index}].payload`,
            )),
          };
        });
        update.run(JSON.stringify({
          ...snapshot,
          output: { ...(output as Record<string, unknown>), proposals },
        }), item.id);
      } catch {
        // Preserve corrupt historical snapshots byte-for-byte. Repository
        // decoding exposes only the typed invalid audit status.
      }
    }
  }
}

function hasTable(db: DatabaseSync, name: string): boolean {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(name) !== undefined;
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
    if (version < 4) {
      const interviewsTable = db.prepare(`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'interviews'
      `).get();
      if (interviewsTable !== undefined) {
        db.exec('ALTER TABLE interviews ADD COLUMN review_snapshot_json TEXT;');
      }
    }
    if (version < 5) {
      if (hasTable(db, 'positions')) {
        db.exec("ALTER TABLE positions ADD COLUMN location TEXT NOT NULL DEFAULT '';");
      }
      if (hasTable(db, 'projects')) {
        db.exec("ALTER TABLE projects ADD COLUMN unclassified_notes TEXT NOT NULL DEFAULT '';");
      }
      if (hasTable(db, 'change_proposals') && hasTable(db, 'asset_versions')) {
        migrateLegacyProjectJson(db);
      }
      migrateNestedProjectSnapshots(db);
      db.exec(`
        CREATE TABLE capability_analysis_runs (
          id TEXT PRIMARY KEY,
          selected_position_ids_json TEXT NOT NULL,
          prompt_snapshot TEXT NOT NULL,
          provider_origin TEXT NOT NULL,
          model TEXT NOT NULL,
          input_json TEXT NOT NULL,
          output_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        ) STRICT;
      `);
      if (hasTable(db, 'change_proposals')) {
        db.exec(`
          ALTER TABLE change_proposals
            ADD COLUMN analysis_run_id TEXT
            REFERENCES capability_analysis_runs(id) ON DELETE SET NULL;
        `);
      }
    }
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
