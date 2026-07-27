// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestDatabase } from '../helpers/database';

describe('database migrations', () => {
  it('creates the Stage 1 schema and default prompt templates', () => {
    const db = createTestDatabase();

    try {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      ).all().map((row) => String(row.name)).filter((name) => !name.startsWith('sqlite_'));

      expect(tables).toEqual([
        'asset_versions',
        'capabilities',
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
      const templates = db.prepare('SELECT id, kind FROM prompt_templates ORDER BY kind').all();
      expect(templates.map((row) => String(row.kind))).toEqual([
        'capability-analysis', 'interview-review', 'preparation',
      ]);
      for (const template of templates) {
        expect(z.string().uuid().safeParse(template.id).success).toBe(true);
      }
      expect(db.prepare('SELECT COUNT(*) AS count FROM prompt_templates').get())
        .toMatchObject({ count: 3 });
      expect(db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 1 });
      expect(db.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 });
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

      const { migrate } = await import('../../src/main/migrations');
      migrate(db);

      expect(db.prepare('SELECT company FROM positions WHERE id = ?').get('position-1'))
        .toMatchObject({ company: '远山科技' });
      expect(db.prepare('SELECT COUNT(*) AS count FROM prompt_templates').get())
        .toMatchObject({ count: 3 });
    } finally {
      db.close();
    }
  });
});
