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

  it('locks every user edit after review and distinguishes conflicts from missing rows', () => {
    const db = createTestDatabase();

    try {
      const position = createPositionsRepository(db).create({
        company: '甲公司',
        title: '产品经理',
        interest: 5,
        rawJd: '完整 JD',
      });
      const interviews = createInterviewsRepository(db);
      const input = {
        positionId: position.id,
        roundName: '一面',
        interviewDate: '2026-07-27',
        transcript: '面试记录',
        personalNotes: '个人笔记',
        feedbackResult: null,
      };
      const created = interviews.create(input);
      db.prepare(`
        UPDATE interviews SET review_snapshot_json = ? WHERE id = ?
      `).run(JSON.stringify({
        promptSnapshot: '复盘 Prompt',
        modelSnapshot: 'model-a',
        inputSnapshot: '{"safe":true}',
        output: {
          summary: '总结',
          strengths: [],
          gaps: [],
          proposals: [],
        },
        reviewedAt: '2026-07-27T00:00:00.000Z',
      }), created.id);

      expect(() => interviews.update(created.id, { ...input, roundName: '终面' }))
        .toThrow(expect.objectContaining({ code: 'CONFLICT' }));
      expect(() => interviews.saveSummary(created.id, '覆盖总结'))
        .toThrow(expect.objectContaining({ code: 'CONFLICT' }));
      expect(() => interviews.update(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        input,
      )).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
      expect(interviews.get(created.id).roundName).toBe('一面');
    } finally {
      db.close();
    }
  });

  it('isolates invalid review snapshots without exposing raw JSON or breaking lists and detail', () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const position = positions.create({
        company: '甲公司',
        title: '产品经理',
        interest: 5,
        rawJd: '完整 JD',
      });
      const interviews = createInterviewsRepository(db);
      const first = interviews.create({
        positionId: position.id,
        roundName: '一面',
        interviewDate: null,
        transcript: '记录一',
        personalNotes: '',
        feedbackResult: null,
      });
      const second = interviews.create({
        positionId: position.id,
        roundName: '二面',
        interviewDate: null,
        transcript: '记录二',
        personalNotes: '',
        feedbackResult: null,
      });
      db.prepare('UPDATE interviews SET review_snapshot_json = ? WHERE id = ?')
        .run('{"secret":"must-not-leak"', second.id);

      expect(interviews.get(first.id).reviewSnapshot).toEqual({ status: 'none' });
      expect(interviews.get(second.id).reviewSnapshot).toEqual({ status: 'invalid' });
      const listed = interviews.listByPosition(position.id);
      expect(listed).toHaveLength(2);
      expect(JSON.stringify(listed)).not.toContain('must-not-leak');
      expect(positions.getDetail(position.id).interviews).toHaveLength(2);
    } finally {
      db.close();
    }
  });
});
