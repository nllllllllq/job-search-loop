// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../../src/main/database';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/main/migrations';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createProposalsRepository } from '../../src/main/repositories/proposals';
import { createTestDatabase } from '../helpers/database';

function temporaryDatabasePath(label: string): string {
  return join(tmpdir(), `job-search-loop-${label}-${randomUUID()}.sqlite`);
}

function removeDatabaseFiles(path: string): void {
  for (const candidate of [path, `${path}-shm`, `${path}-wal`]) {
    rmSync(candidate, { force: true });
  }
}

describe('database migrations', () => {
  it('migrates V5 prompt templates to allow project imports without losing custom prompts', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE prompt_templates (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL UNIQUE CHECK (kind IN ('preparation', 'interview-review', 'capability-analysis')),
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO prompt_templates VALUES (
        'custom-preparation',
        'preparation',
        '岗位准备',
        '我的定制内容',
        '2026-07-27T00:00:00.000Z',
        '2026-07-27T00:00:00.000Z'
      );
      PRAGMA user_version = 5;
    `);

    try {
      migrate(db);

      expect(db.prepare('PRAGMA user_version').get())
        .toEqual({ user_version: 6 });
      expect(db.prepare(
        "SELECT content FROM prompt_templates WHERE kind = 'preparation'",
      ).get()).toEqual({ content: '我的定制内容' });
      expect(() => db.prepare(`
        INSERT INTO prompt_templates VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'project-import',
        'project-import',
        '项目文件导入',
        '按原文解析',
        '2026-07-28T00:00:00.000Z',
        '2026-07-28T00:00:00.000Z',
      )).not.toThrow();
    } finally {
      db.close();
    }
  });

  it('creates the Stage 1 schema and default prompt templates', () => {
    const db = createTestDatabase();

    try {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      ).all().map((row) => String(row.name)).filter((name) => !name.startsWith('sqlite_'));

      expect(tables).toEqual([
        'asset_versions',
        'capabilities',
        'capability_analysis_runs',
        'capability_evidence',
        'change_proposals',
        'insights',
        'interviews',
        'positions',
        'preparation_materials',
        'process_stages',
        'projects',
        'prompt_templates',
        'questions',
      ]);
      expect(db.prepare('PRAGMA table_info(interviews)').all().map(
        (column) => String(column.name),
      )).toContain('review_snapshot_json');
      const templates = db.prepare(
        'SELECT id, kind, name, content FROM prompt_templates ORDER BY kind',
      ).all();
      expect(templates.map(({ id, kind, name }) => ({ id, kind, name }))).toEqual([
        {
          id: '2c4e2b10-52aa-4a0a-b5a3-3e3b9c5e7f03',
          kind: 'capability-analysis',
          name: '共性能力分析',
        },
        {
          id: '1b4a8791-78e5-42f2-8da4-a322bb32f9e2',
          kind: 'interview-review',
          name: '面试复盘',
        },
        {
          id: '0a8d1dfc-9a87-4d57-9e3c-451c20a6a901',
          kind: 'preparation',
          name: '岗位准备',
        },
        {
          id: 'd5a6f2f5-4eb7-45bd-8ce3-37f4efc1bb64',
          kind: 'project-import',
          name: '项目文件导入',
        },
      ]);
      for (const template of templates) {
        expect(z.string().uuid().safeParse(template.id).success).toBe(true);
        expect(String(template.content).trim()).not.toBe('');
      }
      expect(db.prepare('SELECT COUNT(*) AS count FROM prompt_templates').get())
        .toMatchObject({ count: 4 });
      expect(db.prepare('PRAGMA user_version').get())
        .toMatchObject({ user_version: CURRENT_SCHEMA_VERSION });
      expect(db.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 });
    } finally {
      db.close();
    }
  });

  it('enforces database constraints and creates only STRICT tables', () => {
    const db = createTestDatabase();
    const now = '2026-07-27T00:00:00.000Z';

    try {
      const definitions = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      ).all();
      expect(definitions).toHaveLength(13);
      for (const definition of definitions) {
        expect(String(definition.sql).trim()).toMatch(/\) STRICT;?$/);
      }

      const insertPosition = db.prepare(`
        INSERT INTO positions (
          id, company, title, interest, raw_jd, current_stage, final_result, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      expect(() => insertPosition.run(
        'invalid-interest', '远山科技', '产品经理', 0, '负责产品规划', null, null, now, now,
      )).toThrow();
      insertPosition.run('constraint-position', '远山科技', '产品经理', 5, '负责产品规划', null, null, now, now);

      const insertStage = db.prepare(`
        INSERT INTO process_stages (
          id, position_id, name, canonical_stage, actual_date, expected_date, feedback, notes, order_index, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertStage.run('constraint-stage-1', 'constraint-position', '感兴趣', 'interested', null, null, '', '', 0, now, now);
      expect(() => insertStage.run(
        'constraint-stage-2', 'constraint-position', '已投递', 'applied', null, null, '', '', 0, now, now,
      )).toThrow();

      expect(() => db.prepare(`
        INSERT INTO questions (id, type, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      `).run('invalid-question', 'unknown', '问题', now, now)).toThrow();
      for (const [column, value] of [
        ['target_type', 'unknown'],
        ['operation', 'replace'],
        ['status', 'unknown'],
      ]) {
        expect(() => db.prepare(`
          INSERT INTO change_proposals (
            id, target_type, target_id, operation, payload_json, rationale, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `invalid-proposal-${column}`,
          column === 'target_type' ? value : 'project',
          null,
          column === 'operation' ? value : 'create',
          '{}',
          '测试约束',
          column === 'status' ? value : 'pending',
          now,
          now,
        )).toThrow();
      }
    } finally {
      db.close();
    }
  });

  it('cascades position deletion to its execution-layer records', () => {
    const db = createTestDatabase();
    const now = '2026-07-27T00:00:00.000Z';

    try {
      const foreignKey = (table: string) => db.prepare(`PRAGMA foreign_key_list(${table})`).all()
        .find((row) => row.table === 'positions');
      for (const table of ['process_stages', 'preparation_materials', 'interviews']) {
        expect(foreignKey(table)).toMatchObject({ table: 'positions', on_delete: 'CASCADE' });
      }

      db.prepare(`
        INSERT INTO positions (
          id, company, title, interest, raw_jd, current_stage, final_result, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('position-2', '远山科技', '产品经理', 5, '负责产品规划', 'interested', null, now, now);
      db.prepare(`
        INSERT INTO process_stages (
          id, position_id, name, canonical_stage, actual_date, expected_date, feedback, notes, order_index, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('stage-1', 'position-2', '感兴趣', 'interested', null, null, '', '', 0, now, now);
      db.prepare(`
        INSERT INTO preparation_materials (
          id, position_id, raw_jd_snapshot, prompt_snapshot, assets_snapshot, model_snapshot, output_snapshot, generated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('preparation-1', 'position-2', '负责产品规划', '准备提示词', '{}', 'test-model', '{}', now, now);
      db.prepare(`
        INSERT INTO interviews (
          id, position_id, round_name, interview_date, transcript, personal_notes, summary, feedback_result, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('interview-1', 'position-2', '一面', null, '面试记录', '', null, null, now, now);

      db.prepare('DELETE FROM positions WHERE id = ?').run('position-2');

      for (const table of ['process_stages', 'preparation_materials', 'interviews']) {
        expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toMatchObject({ count: 0 });
      }
    } finally {
      db.close();
    }
  });

  it('is idempotent and preserves existing data', async () => {
    const db = createTestDatabase();

    try {
      db.prepare(`
        INSERT INTO positions (
          id, company, title, interest, raw_jd, current_stage, final_result, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'position-1', '远山科技', '产品经理', 5, '负责产品规划与用户研究',
        'interested', null, '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z',
      );

      migrate(db);

      expect(db.prepare('SELECT company FROM positions WHERE id = ?').get('position-1'))
        .toMatchObject({ company: '远山科技' });
      expect(db.prepare('SELECT COUNT(*) AS count FROM prompt_templates').get())
        .toMatchObject({ count: 4 });
    } finally {
      db.close();
    }
  });

  it('migrates a V4 database to the current schema without losing positions, projects, or proposals', () => {
    const db = new DatabaseSync(':memory:');
    const now = '2026-07-27T00:00:00.000Z';

    try {
      db.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA user_version = 4;
        CREATE TABLE positions (
          id TEXT PRIMARY KEY,
          company TEXT NOT NULL,
          title TEXT NOT NULL,
          interest INTEGER NOT NULL,
          raw_jd TEXT NOT NULL,
          current_stage TEXT,
          final_result TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          background TEXT NOT NULL DEFAULT '',
          goal TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT '',
          key_decisions TEXT NOT NULL DEFAULT '',
          outcomes_and_evidence TEXT NOT NULL DEFAULT '',
          reflections TEXT NOT NULL DEFAULT '',
          storytelling_versions TEXT NOT NULL DEFAULT '',
          outcome TEXT NOT NULL DEFAULT '',
          evidence TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE change_proposals (
          id TEXT PRIMARY KEY,
          target_type TEXT NOT NULL,
          target_id TEXT,
          operation TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          accepted_payload_json TEXT,
          rationale TEXT NOT NULL,
          position_id TEXT,
          interview_id TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          resolved_at TEXT
        ) STRICT;
        CREATE TABLE asset_versions (
          id TEXT PRIMARY KEY,
          asset_type TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(asset_type, asset_id, version)
        ) STRICT;
        CREATE TABLE interviews (
          id TEXT PRIMARY KEY,
          position_id TEXT NOT NULL,
          round_name TEXT NOT NULL,
          interview_date TEXT,
          transcript TEXT NOT NULL,
          personal_notes TEXT NOT NULL DEFAULT '',
          summary TEXT,
          feedback_result TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          review_snapshot_json TEXT
        ) STRICT;
        CREATE TABLE preparation_materials (
          id TEXT PRIMARY KEY,
          position_id TEXT NOT NULL,
          raw_jd_snapshot TEXT NOT NULL,
          prompt_snapshot TEXT NOT NULL,
          assets_snapshot TEXT NOT NULL,
          model_snapshot TEXT NOT NULL,
          output_snapshot TEXT NOT NULL,
          generated_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        ) STRICT;
      `);
      db.prepare(`
        INSERT INTO positions (
          id, company, title, interest, raw_jd, current_stage, final_result,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      `).run('position-v4', '甲公司', '产品经理', 5, '完整 JD', now, now);
      db.prepare(`
        INSERT INTO projects (
          id, name, background, goal, role, key_decisions, outcomes_and_evidence,
          reflections, storytelling_versions, outcome, evidence, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'project-v4', '旧项目', '背景', '目标', '角色', '决策', '旧组合字段',
        '反思', '讲述', '结果', '证据', now, now,
      );
      db.prepare(`
        INSERT INTO change_proposals (
          id, target_type, target_id, operation, payload_json, accepted_payload_json,
          rationale, position_id, interview_id, status, created_at, updated_at, resolved_at
        ) VALUES (?, 'capability', NULL, 'create', ?, NULL, ?, ?, NULL, 'pending', ?, ?, NULL)
      `).run(
        'proposal-v4',
        JSON.stringify({
          name: '沟通',
          jdFrequency: 1,
          evidence: '',
          gaps: '',
          mergedIntoId: null,
        }),
        '旧建议',
        'position-v4',
        now,
        now,
      );
      const legacyProjectSnapshot = {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: '快照项目',
        background: '',
        goal: '',
        role: '',
        keyDecisions: '',
        outcome: '',
        evidence: '',
        reflections: '',
        storytellingVersions: '',
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(`
        INSERT INTO preparation_materials (
          id, position_id, raw_jd_snapshot, prompt_snapshot, assets_snapshot,
          model_snapshot, output_snapshot, generated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'preparation-v4',
        'position-v4',
        '完整 JD',
        'Prompt',
        JSON.stringify({ projects: [legacyProjectSnapshot], questions: [] }),
        'model-a',
        '{}',
        now,
        now,
      );
      db.prepare(`
        INSERT INTO preparation_materials (
          id, position_id, raw_jd_snapshot, prompt_snapshot, assets_snapshot,
          model_snapshot, output_snapshot, generated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'corrupt-preparation-v4',
        'position-v4',
        '完整 JD',
        'Prompt',
        '{"private":"must-stay-isolated"',
        'model-a',
        '{}',
        now,
        now,
      );
      db.prepare(`
        INSERT INTO interviews (
          id, position_id, round_name, interview_date, transcript, personal_notes,
          summary, feedback_result, created_at, updated_at, review_snapshot_json
        ) VALUES (?, ?, ?, NULL, ?, '', ?, NULL, ?, ?, ?)
      `).run(
        'interview-v4',
        'position-v4',
        '一面',
        '记录',
        '总结',
        now,
        now,
        JSON.stringify({
          promptSnapshot: 'Prompt',
          modelSnapshot: 'model-a',
          inputSnapshot: '{}',
          output: {
            summary: '总结',
            strengths: [],
            gaps: [],
            proposals: [{
              targetType: 'project',
              targetId: null,
              operation: 'create',
              rationale: '新增项目',
              payload: {
                name: '快照项目',
                background: '',
                goal: '',
                role: '',
                keyDecisions: '',
                outcome: '',
                evidence: '',
                reflections: '',
                storytellingVersions: '',
              },
            }],
          },
          reviewedAt: now,
        }),
      );

      migrate(db);

      expect(db.prepare('PRAGMA user_version').get())
        .toMatchObject({ user_version: CURRENT_SCHEMA_VERSION });
      expect(db.prepare('SELECT company, location FROM positions').get()).toEqual({
        company: '甲公司',
        location: '',
      });
      expect(db.prepare('SELECT name, unclassified_notes FROM projects').get()).toEqual({
        name: '旧项目',
        unclassified_notes: '',
      });
      expect(db.prepare('SELECT id, analysis_run_id FROM change_proposals').get()).toEqual({
        id: 'proposal-v4',
        analysis_run_id: null,
      });
      expect(db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'capability_analysis_runs'",
      ).get()).toEqual({ name: 'capability_analysis_runs' });
      expect(JSON.parse(String(db.prepare(
        'SELECT assets_snapshot FROM preparation_materials WHERE id = ?',
      ).get('preparation-v4')?.assets_snapshot)).projects[0]).toMatchObject({
        unclassifiedNotes: '',
      });
      expect(JSON.parse(String(db.prepare(
        'SELECT review_snapshot_json FROM interviews WHERE id = ?',
      ).get('interview-v4')?.review_snapshot_json)).output.proposals[0].payload)
        .toMatchObject({ unclassifiedNotes: '' });
      expect(db.prepare(
        'SELECT assets_snapshot FROM preparation_materials WHERE id = ?',
      ).get('corrupt-preparation-v4')).toEqual({
        assets_snapshot: '{"private":"must-stay-isolated"',
      });

      migrate(db);
      expect(db.prepare('SELECT COUNT(*) AS count FROM positions').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM projects').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM change_proposals').get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it('migrates legacy combined project results without losing the narrative', () => {
    const db = new DatabaseSync(':memory:');
    const now = '2026-07-27T00:00:00.000Z';

    try {
      db.exec(`
        PRAGMA user_version = 1;
        CREATE TABLE projects (
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
        CREATE TABLE change_proposals (
          id TEXT PRIMARY KEY,
          target_type TEXT NOT NULL,
          target_id TEXT,
          operation TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          accepted_payload_json TEXT,
          rationale TEXT NOT NULL,
          position_id TEXT,
          interview_id TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          resolved_at TEXT
        ) STRICT;
        CREATE TABLE asset_versions (
          id TEXT PRIMARY KEY,
          asset_type TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(asset_type, asset_id, version)
        ) STRICT;
      `);
      db.prepare(`
        INSERT INTO projects (
          id, name, background, goal, role, key_decisions, outcomes_and_evidence,
          reflections, storytelling_versions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '旧项目',
        '旧背景',
        '旧目标',
        '旧角色',
        '旧决策',
        '结果与证据原文',
        '旧反思',
        '旧讲述版本',
        now,
        now,
      );
      const legacyPendingPayload = {
        name: '旧项目',
        background: '提案旧背景',
        goal: '提案旧目标',
        role: '提案旧角色',
        keyDecisions: '提案旧决策',
        outcomesAndEvidence: '提案里的旧结果与证据',
        reflections: '提案旧反思',
        storytelling_versions: '提案旧讲述版本',
      };
      const legacyAcceptedPayload = {
        ...legacyPendingPayload,
        outcomesAndEvidence: '已接受提案的旧结果与证据',
      };
      db.prepare(`
        INSERT INTO change_proposals (
          id, target_type, target_id, operation, payload_json, accepted_payload_json,
          rationale, position_id, interview_id, status, created_at, updated_at, resolved_at
        ) VALUES (?, 'project', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'update', ?, NULL, ?, NULL, NULL, 'pending', ?, ?, NULL)
      `).run(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        JSON.stringify(legacyPendingPayload),
        '迁移后仍应可接受',
        now,
        now,
      );
      db.prepare(`
        INSERT INTO change_proposals (
          id, target_type, target_id, operation, payload_json, accepted_payload_json,
          rationale, position_id, interview_id, status, created_at, updated_at, resolved_at
        ) VALUES (?, 'project', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'update', ?, ?, ?, NULL, NULL, 'accepted', ?, ?, ?)
      `).run(
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        JSON.stringify(legacyPendingPayload),
        JSON.stringify(legacyAcceptedPayload),
        '已接受的旧提案',
        now,
        now,
        now,
      );
      db.prepare(`
        INSERT INTO asset_versions (
          id, asset_type, asset_id, version, snapshot_json, created_at
        ) VALUES (?, 'project', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, ?, ?)
      `).run(
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        JSON.stringify({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          ...legacyPendingPayload,
          outcomesAndEvidence: '历史版本的旧结果与证据',
          createdAt: now,
          updatedAt: now,
        }),
        now,
      );

      migrate(db);

      expect(db.prepare(
        'SELECT outcome, evidence FROM projects WHERE id = ?',
      ).get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toEqual({
        outcome: '结果与证据原文',
        evidence: '',
      });
      const pendingJson = JSON.parse(String(db.prepare(
        'SELECT payload_json FROM change_proposals WHERE id = ?',
      ).get('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')?.payload_json));
      expect(pendingJson).toMatchObject({
        outcome: '提案里的旧结果与证据',
        evidence: '',
        storytellingVersions: '提案旧讲述版本',
        unclassifiedNotes: '',
      });
      expect(pendingJson).not.toHaveProperty('outcomesAndEvidence');
      expect(pendingJson).not.toHaveProperty('storytelling_versions');
      const acceptedJson = JSON.parse(String(db.prepare(
        'SELECT accepted_payload_json FROM change_proposals WHERE id = ?',
      ).get('cccccccc-cccc-4ccc-8ccc-cccccccccccc')?.accepted_payload_json));
      expect(acceptedJson).toMatchObject({
        outcome: '已接受提案的旧结果与证据',
        evidence: '',
        storytellingVersions: '提案旧讲述版本',
        unclassifiedNotes: '',
      });
      const versionJson = JSON.parse(String(db.prepare(
        'SELECT snapshot_json FROM asset_versions WHERE id = ?',
      ).get('dddddddd-dddd-4ddd-8ddd-dddddddddddd')?.snapshot_json));
      expect(versionJson).toMatchObject({
        outcome: '历史版本的旧结果与证据',
        evidence: '',
        storytellingVersions: '提案旧讲述版本',
        unclassifiedNotes: '',
      });

      const proposals = createProposalsRepository(db);
      const assets = createAssetsRepository(db);
      expect(assets.getProject('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').storytellingVersions)
        .toBe('旧讲述版本');
      const pending = proposals.get('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      expect(pending.payload).toMatchObject({
        outcome: '提案里的旧结果与证据',
        evidence: '',
      });
      proposals.accept('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', pending.payload);
      expect(assets.getProject('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toMatchObject({
        outcome: '提案里的旧结果与证据',
        evidence: '',
        storytellingVersions: '提案旧讲述版本',
      });
      expect(proposals.get('cccccccc-cccc-4ccc-8ccc-cccccccccccc').acceptedPayload).toMatchObject({
        outcome: '已接受提案的旧结果与证据',
        evidence: '',
      });
      const migratedAcceptedJson = db.prepare(
        'SELECT accepted_payload_json FROM change_proposals WHERE id = ?',
      ).get('cccccccc-cccc-4ccc-8ccc-cccccccccccc')?.accepted_payload_json;
      migrate(db);
      expect(db.prepare(
        'SELECT accepted_payload_json FROM change_proposals WHERE id = ?',
      ).get('cccccccc-cccc-4ccc-8ccc-cccccccccccc')?.accepted_payload_json)
        .toBe(migratedAcceptedJson);
      expect(db.prepare('PRAGMA user_version').get())
        .toMatchObject({ user_version: CURRENT_SCHEMA_VERSION });
    } finally {
      db.close();
    }
  });

  it('migrates readable V4 project JSON rows while preserving corrupt audit rows byte-for-byte', () => {
    const db = new DatabaseSync(':memory:');
    const now = '2026-07-27T00:00:00.000Z';
    const validPayload = JSON.stringify({
      name: '旧项目',
      outcomesAndEvidence: '完整旧文本',
    });

    try {
      db.exec(`
        PRAGMA user_version = 4;
        CREATE TABLE change_proposals (
          id TEXT PRIMARY KEY,
          target_type TEXT NOT NULL,
          target_id TEXT,
          operation TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          accepted_payload_json TEXT,
          rationale TEXT NOT NULL,
          position_id TEXT,
          interview_id TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          resolved_at TEXT
        ) STRICT;
        CREATE TABLE asset_versions (
          id TEXT PRIMARY KEY,
          asset_type TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(asset_type, asset_id, version)
        ) STRICT;
      `);
      const insert = db.prepare(`
        INSERT INTO change_proposals (
          id, target_type, target_id, operation, payload_json, accepted_payload_json,
          rationale, position_id, interview_id, status, created_at, updated_at, resolved_at
        ) VALUES (?, 'project', NULL, 'create', ?, NULL, '迁移测试', NULL, NULL, 'pending', ?, ?, NULL)
      `);
      insert.run('valid-first', validPayload, now, now);
      insert.run('corrupt-second', '{not-json', now, now);
      db.prepare(`
        INSERT INTO change_proposals (
          id, target_type, target_id, operation, payload_json, accepted_payload_json,
          rationale, position_id, interview_id, status, created_at, updated_at, resolved_at
        ) VALUES (?, 'project', NULL, 'create', ?, ?, '迁移测试', NULL, NULL, 'accepted', ?, ?, ?)
      `).run('corrupt-accepted-third', validPayload, '{accepted-not-json', now, now, now);
      db.prepare(`
        INSERT INTO asset_versions (
          id, asset_type, asset_id, version, snapshot_json, created_at
        ) VALUES (?, 'project', ?, 1, ?, ?)
      `).run('valid-version', 'valid-project', validPayload, now);
      db.prepare(`
        INSERT INTO asset_versions (
          id, asset_type, asset_id, version, snapshot_json, created_at
        ) VALUES (?, 'project', ?, 1, ?, ?)
      `).run('corrupt-version', 'corrupt-project', '{also-not-json', now);

      expect(() => migrate(db)).not.toThrow();

      expect(db.prepare('PRAGMA user_version').get())
        .toMatchObject({ user_version: CURRENT_SCHEMA_VERSION });
      expect(JSON.parse(String(db.prepare(
        'SELECT payload_json FROM change_proposals WHERE id = ?',
      ).get('valid-first')?.payload_json))).toMatchObject({
        outcome: '完整旧文本',
        evidence: '',
        unclassifiedNotes: '',
      });
      expect(db.prepare(
        'SELECT payload_json FROM change_proposals WHERE id = ?',
      ).get('corrupt-second')).toMatchObject({ payload_json: '{not-json' });
      expect(db.prepare(`
        SELECT payload_json, accepted_payload_json
        FROM change_proposals WHERE id = ?
      `).get('corrupt-accepted-third')).toEqual({
        payload_json: validPayload,
        accepted_payload_json: '{accepted-not-json',
      });
      expect(JSON.parse(String(db.prepare(
        'SELECT snapshot_json FROM asset_versions WHERE id = ?',
      ).get('valid-version')?.snapshot_json))).toMatchObject({
        outcome: '完整旧文本',
        evidence: '',
        unclassifiedNotes: '',
      });
      expect(db.prepare(
        'SELECT snapshot_json FROM asset_versions WHERE id = ?',
      ).get('corrupt-version')).toMatchObject({ snapshot_json: '{also-not-json' });
    } finally {
      db.close();
    }
  });

  it('rejects future database versions before schema writes and preserves the database', () => {
    const db = new DatabaseSync(':memory:');

    try {
      db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1}`);

      expect(() => migrate(db)).toThrow(
        `Unsupported database schema version ${CURRENT_SCHEMA_VERSION + 1}; current version is ${CURRENT_SCHEMA_VERSION}`,
      );
      expect(db.prepare('PRAGMA user_version').get())
        .toMatchObject({ user_version: CURRENT_SCHEMA_VERSION + 1 });
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('closes a rejected future-version database so its file can be replaced immediately', () => {
    const path = temporaryDatabasePath('future-version');

    try {
      const futureVersion = new DatabaseSync(path);
      futureVersion.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1}`);
      futureVersion.close();

      expect(() => openDatabase(path)).toThrow('Unsupported database schema version');
      removeDatabaseFiles(path);
      expect(existsSync(path)).toBe(false);

      const replacement = new DatabaseSync(path);
      replacement.exec('CREATE TABLE replacement_check (id INTEGER PRIMARY KEY)');
      replacement.close();
      expect(existsSync(path)).toBe(true);
    } finally {
      removeDatabaseFiles(path);
    }
  });

  it('uses WAL and a five-second busy timeout for file-backed databases that persist after reopen', () => {
    const path = temporaryDatabasePath('persistence');
    let db: DatabaseSync | undefined;
    let reopened: DatabaseSync | undefined;

    try {
      db = openDatabase(path);
      expect(db.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' });
      expect(db.prepare('PRAGMA busy_timeout').get()).toMatchObject({ timeout: 5000 });
      db.prepare(`
        INSERT INTO positions (
          id, company, title, interest, raw_jd, current_stage, final_result, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'persisted-position', '远山科技', '产品经理', 4, '负责产品规划', 'applied', null,
        '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z',
      );
      db.close();
      db = undefined;

      reopened = openDatabase(path);
      expect(reopened.prepare('SELECT company FROM positions WHERE id = ?').get('persisted-position'))
        .toMatchObject({ company: '远山科技' });
    } finally {
      reopened?.close();
      db?.close();
      removeDatabaseFiles(path);
    }
  });
});
