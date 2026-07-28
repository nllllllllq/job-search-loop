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
      expect(positions.listStages(created.id).map((stage) => stage.canonicalStage)).toEqual([
        'interested',
        'applied',
        'assessment',
        'interview',
        'offer',
      ]);
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
      expect(remaining.map((stage) => stage.orderIndex)).toEqual([0, 1, 2, 3]);
      expect(remaining.some((stage) => stage.id === applied.id)).toBe(false);
      expect(positions.get(created.id).currentStage).toBe('interested');

      for (const stage of remaining) {
        positions.removeStage(created.id, stage.id);
      }
      expect(positions.listStages(created.id)).toEqual([]);
      expect(positions.get(created.id).currentStage).toBeNull();
    } finally {
      db.close();
    }
  });
});
