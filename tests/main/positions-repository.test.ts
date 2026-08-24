// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createTestDatabase } from '../helpers/database';

describe('positions repository', () => {
  it('creates a position and its exact default process atomically', () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const created = positions.create({
        company: '远山科技',
        title: '产品经理',
        location: '上海',
        interest: 5,
        rawJd: '负责产品规划与用户研究',
      });

      expect(positions.list()).toHaveLength(1);
      expect(created.location).toBe('上海');
      expect(positions.list({ query: '上海' })).toEqual([
        expect.objectContaining({ id: created.id, location: '上海' }),
      ]);
      const createdStages = positions.listStages(created.id);
      expect(createdStages.map((stage) => stage.canonicalStage)).toEqual([
        'applied',
        'assessment',
        'interview',
        'offer',
      ]);
      expect(createdStages[0]).toMatchObject({
        canonicalStage: 'applied',
        actualDate: created.createdAt.slice(0, 10),
        expectedDate: null,
      });
      expect(createdStages.find((stage) => stage.canonicalStage === 'assessment')?.name).toBe('测评');
      expect(positions.get(created.id).currentStage).toBe('applied');
    } finally {
      db.close();
    }
  });

  it('rejects incomplete, duplicate, and foreign stage reorder membership as validation errors', () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const first = positions.create({
        company: '远山科技',
        title: '产品经理',
        interest: 5,
        rawJd: '负责产品规划',
      });
      const second = positions.create({
        company: '青川科技',
        title: '产品经理',
        interest: 4,
        rawJd: '负责产品迭代',
      });
      const original = positions.listStages(first.id);
      const ids = original.map((stage) => stage.id);
      const foreignId = positions.listStages(second.id)[0].id;
      const invalidOrders = [
        ids.slice(0, -1),
        [...ids.slice(0, -1), ids[0]],
        [...ids.slice(0, -1), foreignId],
      ];

      for (const orderedIds of invalidOrders) {
        expect(() => positions.reorderStages(first.id, orderedIds))
          .toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
        expect(positions.listStages(first.id).map((stage) => stage.id)).toEqual(ids);
      }
    } finally {
      db.close();
    }
  });

  it('creates a coherent process for a selected initial stage and date', () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const created = positions.create({
        company: '远山科技',
        title: '产品经理',
        interest: 5,
        rawJd: '负责产品规划',
        initialStage: 'assessment',
        initialDate: '2026-08-12',
      });

      expect(positions.listStages(created.id).map((stage) => [
        stage.canonicalStage,
        stage.name,
        stage.actualDate,
        stage.expectedDate,
      ])).toEqual([
        ['applied', '已投递', null, null],
        ['assessment', '测评', null, '2026-08-12'],
        ['interview', '面试', null, null],
        ['offer', 'Offer', null, null],
      ]);
      expect(created.currentStage).toBe('assessment');
    } finally {
      db.close();
    }
  });

  it('removes a stage, compacts the order, refreshes the current stage, and allows an empty flow', () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const created = positions.create({
        company: '远山科技',
        title: '产品经理',
        interest: 5,
        rawJd: '负责产品规划',
      });
      const original = positions.listStages(created.id);
      const applied = original.find((stage) => stage.canonicalStage === 'applied');
      if (!applied) throw new Error('missing applied stage');

      positions.upsertStage({
        ...applied,
        actualDate: '2026-07-27',
      });
      expect(positions.get(created.id).currentStage).toBe('applied');

      const remaining = positions.removeStage(created.id, applied.id);
      expect(remaining.map((stage) => stage.orderIndex)).toEqual([0, 1, 2]);
      expect(remaining.some((stage) => stage.id === applied.id)).toBe(false);
      expect(positions.get(created.id).currentStage).toBe('assessment');

      for (const stage of remaining) {
        positions.removeStage(created.id, stage.id);
      }
      expect(positions.listStages(created.id)).toEqual([]);
      expect(positions.get(created.id).currentStage).toBeNull();
    } finally {
      db.close();
    }
  });

  it('uses an assessment or interview notice date as current progress', () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const created = positions.create({
        company: 'Test company',
        title: 'Test title',
        interest: 5,
        rawJd: 'Test JD',
      });
      const stages = positions.listStages(created.id);
      const assessment = stages.find((stage) => stage.canonicalStage === 'assessment');
      const interview = stages.find((stage) => stage.canonicalStage === 'interview');
      const offer = stages.find((stage) => stage.canonicalStage === 'offer');
      if (!assessment || !interview || !offer) throw new Error('missing assessment, interview, or offer stage');

      positions.upsertStage({ ...offer, actualDate: null, expectedDate: '2026-08-08' });
      expect(positions.get(created.id).currentStage).toBe('applied');
      positions.upsertStage({ ...assessment, actualDate: null, expectedDate: '2026-08-08' });
      expect(positions.get(created.id).currentStage).toBe('assessment');
      positions.upsertStage({ ...interview, actualDate: null, expectedDate: '2026-08-08' });
      expect(positions.get(created.id).currentStage).toBe('interview');
    } finally {
      db.close();
    }
  });

  it('sorts company groups and their positions by furthest active progress', () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const create = (company: string, title: string) => positions.create({
        company,
        title,
        location: `${company}位置`,
        interest: 3,
        rawJd: `${title} JD`,
      });
      const interested = create('感兴趣公司', '候选岗位');
      const applied = create('投递公司', '投递岗位');
      const assessment = create('测评公司', '测评岗位');
      const interview = create('面试公司', '面试岗位');
      const offer = create('Offer 公司', 'Offer 岗位');
      const secondInterview = create('Offer 公司', '同公司面试岗位');

      const setStage = (id: string, stage: string, updatedAt: string) => {
        db.prepare('UPDATE positions SET current_stage = ?, updated_at = ? WHERE id = ?')
          .run(stage, updatedAt, id);
      };
      setStage(interested.id, 'interested', '2026-08-08T01:00:00.000Z');
      setStage(applied.id, 'applied', '2026-08-08T02:00:00.000Z');
      setStage(assessment.id, 'assessment', '2026-08-08T03:00:00.000Z');
      setStage(interview.id, 'interview', '2026-08-08T04:00:00.000Z');
      setStage(offer.id, 'offer', '2026-08-08T05:00:00.000Z');
      setStage(secondInterview.id, 'interview', '2026-08-08T06:00:00.000Z');

      const groups = positions.listGrouped?.() ?? [];
      expect(groups.map((group) => group.canonicalName)).toEqual([
        'Offer 公司',
        '面试公司',
        '测评公司',
        '投递公司',
        '感兴趣公司',
      ]);
      expect(groups[0]?.members.map((member) => member.currentStage)).toEqual([
        'offer',
        'interview',
      ]);
    } finally {
      db.close();
    }
  });
});
