// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import { createTestDatabase } from '../helpers/database';

describe('literal company grouping', () => {
  it('groups by original company string and ignores alias tables', () => {
    const db = createTestDatabase();
    try {
      const positions = createPositionsRepository(db);
      const first = positions.create({ company: 'Northstar Labs', title: 'PM', location: '', interest: 3, rawJd: 'JD' });
      const second = positions.create({ company: 'Northstar', title: 'Eng', location: '', interest: 3, rawJd: 'JD' });
      const groups = positions.listGrouped!();
      expect(groups.map((g) => g.canonicalName).sort()).toEqual(['Northstar', 'Northstar Labs']);
      expect(groups.flatMap((g) => g.members).map((m) => m.id).sort()).toEqual([first.id, second.id].sort());
    } finally { db.close(); }
  });
});
