// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createInterviewsRepository } from '../../src/main/repositories/interviews';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createTestDatabase } from '../helpers/database';

describe('interviews repository', () => {
  it('persists summaries only through the explicit saveSummary method', () => {
    const db = createTestDatabase();

    try {
      const position = createPositionsRepository(db).create({
        company: '远山科技',
        title: '产品经理',
        interest: 5,
        rawJd: '负责产品规划',
      });
      const interviews = createInterviewsRepository(db);
      const base = {
        positionId: position.id,
        roundName: '一面',
        interviewDate: '2026-07-27',
        transcript: '面试记录',
        personalNotes: '个人笔记',
        feedbackResult: null,
      };

      const invalid = { ...base, summary: '不允许隐式保存' };
      expect(() => interviews.create(invalid as typeof base)).toThrow();
      const created = interviews.create(base);
      expect(created.summary).toBeNull();
      expect(interviews.saveSummary(created.id, '显式复盘总结').summary).toBe('显式复盘总结');
    } finally {
      db.close();
    }
  });
});
