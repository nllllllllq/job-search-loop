// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createDashboardRepository } from '../../src/main/repositories/dashboard';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createInterviewsRepository } from '../../src/main/repositories/interviews';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createTestDatabase } from '../helpers/database';

function createPosition(
  positions: ReturnType<typeof createPositionsRepository>,
  company: string,
) {
  return positions.create({
    company,
    title: '产品经理',
    interest: 5,
    rawJd: '负责产品规划',
  });
}

describe('dashboard repository', () => {
  it('summarizes only active capabilities after a merge without losing frequency', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const source = assets.saveCapability({
        name: '来源能力',
        jdFrequency: 3,
        evidence: '',
        gaps: '',
        mergedIntoId: null,
      });
      const target = assets.saveCapability({
        name: '目标能力',
        jdFrequency: 5,
        evidence: '',
        gaps: '',
        mergedIntoId: null,
      });
      db.prepare(`
        INSERT INTO capability_evidence (
          id, capability_id, position_id, interview_id, evidence, created_at
        ) VALUES (?, ?, NULL, NULL, ?, ?)
      `).run(
        '99999999-9999-4999-8999-999999999999',
        source.id,
        '来源证据',
        '2026-07-28T00:00:00.000Z',
      );

      assets.mergeCapabilities(source.id, target.id);

      expect(createDashboardRepository(db).getSummary().capabilityFrequency).toEqual([{
        capabilityId: target.id,
        name: target.name,
        jdFrequency: 8,
        evidenceCount: 1,
      }]);
    } finally {
      db.close();
    }
  });

  it('sorts actual and expected process events globally by date', () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const first = createPosition(positions, '远山科技');
      const second = createPosition(positions, '青川科技');
      db.prepare(`
        UPDATE process_stages SET actual_date = ?, expected_date = ?
        WHERE position_id = ? AND canonical_stage = 'applied'
      `).run('2026-08-01', '2026-08-03', first.id);
      db.prepare(`
        UPDATE process_stages SET actual_date = ?
        WHERE position_id = ? AND canonical_stage = 'interested'
      `).run('2026-08-02', second.id);

      const events = createDashboardRepository(db).getSummary().processEvents;

      expect(events.map(({ date, dateType }) => ({ date, dateType }))).toEqual([
        { date: '2026-08-01', dateType: 'actual' },
        { date: '2026-08-02', dateType: 'actual' },
        { date: '2026-08-03', dateType: 'expected' },
      ]);
    } finally {
      db.close();
    }
  });

  it('counts reached interview stages rather than stored interview records', () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const reached = createPosition(positions, '远山科技');
      const alsoReached = createPosition(positions, '云海科技');
      const prematureRecord = createPosition(positions, '青川科技');
      db.prepare(`
        UPDATE process_stages SET actual_date = '2026-08-05'
        WHERE position_id = ? AND canonical_stage = 'interview'
      `).run(reached.id);
      db.prepare(`
        UPDATE process_stages SET actual_date = '2026-08-06'
        WHERE position_id = ? AND canonical_stage = 'interview'
      `).run(alsoReached.id);
      createInterviewsRepository(db).create({
        positionId: prematureRecord.id,
        roundName: '提前记录',
        interviewDate: '2026-08-04',
        transcript: '尚未实际进入面试阶段',
        personalNotes: '',
        feedbackResult: null,
      });

      expect(createDashboardRepository(db).getSummary().positionsWithInterviews).toBe(2);
      expect(db.prepare('SELECT id FROM interviews WHERE position_id = ?')
        .get(prematureRecord.id)).toMatchObject({ id: expect.any(String) });
    } finally {
      db.close();
    }
  });
});
