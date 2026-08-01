// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createDashboardRepository } from '../../src/main/repositories/dashboard';
import { createInterviewsRepository } from '../../src/main/repositories/interviews';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createProposalsRepository } from '../../src/main/repositories/proposals';
import { createTestDatabase } from '../helpers/database';

describe('dashboard overview aggregates', () => {
  it('uses canonical stages, distinct interview positions and stable dated events', () => {
    const db = createTestDatabase();
    try {
      const positions = createPositionsRepository(db);
      const interviews = createInterviewsRepository(db);
      const proposals = createProposalsRepository(db);
      const first = positions.create({
        company: '远山科技',
        title: 'AI 产品经理',
        interest: 5,
        rawJd: '负责 AI 产品规划与用户研究',
      });
      const second = positions.create({
        company: '青川科技',
        title: '产品经理',
        interest: 4,
        rawJd: '负责产品策略与跨团队协作',
      });

      db.prepare(`
        UPDATE process_stages
        SET name = '业务面谈', canonical_stage = 'interview',
            actual_date = '2026-08-02', expected_date = '2026-08-03'
        WHERE position_id = ? AND order_index = 2
      `).run(first.id);
      db.prepare(`
        UPDATE process_stages
        SET name = '终面', canonical_stage = 'interview', actual_date = '2026-08-04'
        WHERE position_id = ? AND order_index = 3
      `).run(first.id);
      db.prepare(`
        UPDATE positions SET current_stage = 'interview' WHERE id IN (?, ?)
      `).run(first.id, second.id);
      db.prepare(`
        UPDATE positions SET updated_at = '2026-09-01T00:00:00.000Z' WHERE id = ?
      `).run(second.id);

      const interview = interviews.create({
        positionId: first.id,
        roundName: '业务面',
        interviewDate: '2026-08-02',
        transcript: '讨论产品策略',
        personalNotes: '',
        feedbackResult: null,
      });
      interviews.saveSummary(interview.id, '已完成复盘');
      proposals.create({
        targetType: 'capability',
        targetId: null,
        operation: 'create',
        payload: {
          name: '用户研究',
          jdFrequency: 2,
          evidence: '两份 JD 均提及用户研究',
          gaps: '',
          mergedIntoId: null,
        },
        rationale: '测试',
        positionId: first.id,
        interviewId: null,
      });

      const summary = createDashboardRepository(db).getSummary();

      expect(summary.totalPositions).toBe(2);
      expect(summary.companyCount).toBe(2);
      expect(summary.stageDistribution).toEqual([
        { stage: 'interview', count: 2 },
      ]);
      expect(summary.positionsWithInterviews).toBe(1);
      expect(summary.completedReviews).toBe(1);
      expect(summary.pendingProposals).toBe(1);
      expect(summary.processEvents.map(({ date, dateType }) => ({
        date,
        dateType,
      }))).toEqual([
        { date: '2026-08-04', dateType: 'actual' },
        { date: '2026-08-03', dateType: 'expected' },
        { date: '2026-08-02', dateType: 'actual' },
        { date: '2026-08-01', dateType: 'actual' },
        { date: '2026-08-01', dateType: 'actual' },
      ]);
      expect(summary.recentPositions.map(({ id }) => id)).toEqual([
        second.id,
        first.id,
      ]);
    } finally {
      db.close();
    }
  });

  it('returns a complete empty summary', () => {
    const db = createTestDatabase();
    try {
      expect(createDashboardRepository(db).getSummary()).toEqual({
        totalPositions: 0,
        companyCount: 0,
        stageDistribution: [],
        positionsWithInterviews: 0,
        completedReviews: 0,
        pendingProposals: 0,
        processEvents: [],
        capabilityFrequency: [],
        recentPositions: [],
      });
    } finally {
      db.close();
    }
  });
});
