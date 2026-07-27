// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createTestDatabase } from '../helpers/database';

const projectInput = {
  name: '增长实验',
  background: '',
  goal: '',
  role: '',
  keyDecisions: '',
  outcomesAndEvidence: '',
  reflections: '',
  storytellingVersions: '',
};

describe('assets repository', () => {
  it('rejects an explicitly supplied invalid asset ID instead of treating it as creation', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      expect(() => assets.saveProject({ ...projectInput, id: '' })).toThrow();
      expect(assets.listProjects()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('keeps manual-edit versions monotonic and snapshots only prior states', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const created = assets.saveProject(projectInput);
      expect(assets.listVersions('project', created.id)).toEqual([]);

      assets.saveProject({ ...projectInput, id: created.id, name: '第二版' });
      assets.saveProject({ ...projectInput, id: created.id, name: '第三版' });

      const versions = assets.listVersions('project', created.id);
      expect(versions.map((version) => version.version)).toEqual([2, 1]);
      expect(versions.map((version) => JSON.parse(version.snapshot).name)).toEqual([
        '第二版',
        '增长实验',
      ]);
    } finally {
      db.close();
    }
  });
});
