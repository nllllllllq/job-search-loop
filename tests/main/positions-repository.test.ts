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
        interest: 5,
        rawJd: '负责产品规划与用户研究',
      });

      expect(positions.list()).toHaveLength(1);
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
});
