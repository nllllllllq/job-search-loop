// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../helpers/database';

describe('database migrations', () => {
  it('creates the Stage 1 schema and default prompt templates', () => {
    const db = createTestDatabase();

    try {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      ).all().map((row) => String(row.name));

      expect(tables).toEqual(expect.arrayContaining([
        'positions', 'process_stages', 'preparation_materials', 'interviews',
        'projects', 'questions', 'capabilities', 'capability_evidence',
        'insights', 'change_proposals', 'asset_versions', 'prompt_templates',
      ]));
      expect(db.prepare('SELECT kind FROM prompt_templates ORDER BY kind').all()
        .map((row) => String(row.kind))).toEqual([
        'capability-analysis', 'interview-review', 'preparation',
      ]);
      expect(db.prepare('SELECT COUNT(*) AS count FROM prompt_templates').get())
        .toMatchObject({ count: 3 });
      expect(db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 1 });
      expect(db.prepare('PRAGMA foreign_keys').get()).toMatchObject({ foreign_keys: 1 });
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
