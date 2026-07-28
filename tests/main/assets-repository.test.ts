// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createTestDatabase } from '../helpers/database';

const projectInput = {
  name: '增长实验',
  background: '新用户不知道第一步该做什么',
  goal: '提升首周留存',
  role: '产品负责人',
  keyDecisions: '先验证引导路径',
  outcome: '首周留存提升 8%',
  evidence: '实验数据与访谈记录',
  reflections: '应更早建立对照组',
  storytellingVersions: '适合业务面试的两分钟讲述',
  unclassifiedNotes: '导入后尚未归类的补充材料',
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

  it('does not create a version when a project is saved without narrative changes', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const created = assets.saveProject(projectInput);

      assets.saveProject({ ...projectInput, id: created.id });

      expect(assets.listVersions('project', created.id)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('versions a project only when an accepted edit changes its narrative', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const created = assets.saveProject(projectInput);

      assets.saveProject({
        ...projectInput,
        id: created.id,
        background: '旧用户也找不到关键入口',
      });

      const versions = assets.listVersions('project', created.id);
      expect(versions).toHaveLength(1);
      expect(JSON.parse(versions[0].snapshot)).toMatchObject(projectInput);
    } finally {
      db.close();
    }
  });

  it('keeps legacy storytelling versions editable and inside project snapshots', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const created = assets.saveProject(projectInput);
      expect(created.storytellingVersions).toBe('适合业务面试的两分钟讲述');

      const updated = assets.saveProject({
        ...projectInput,
        id: created.id,
        storytellingVersions: '适合终面的五分钟讲述',
      });

      expect(updated.storytellingVersions).toBe('适合终面的五分钟讲述');
      expect(JSON.parse(
        assets.listVersions('project', created.id)[0].snapshot,
      )).toMatchObject({
        storytellingVersions: '适合业务面试的两分钟讲述',
        unclassifiedNotes: '导入后尚未归类的补充材料',
      });
    } finally {
      db.close();
    }
  });

  it('validates linked project and capability IDs before saving a question', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const project = assets.saveProject(projectInput);
      const capability = assets.saveCapability({
        name: '用户研究',
        jdFrequency: 3,
        evidence: '完成 12 次访谈',
        gaps: '缺少国际化样本',
        mergedIntoId: null,
      });
      const question = assets.saveQuestion({
        type: 'interviewer',
        text: '如何设计用户研究？',
        answerDraft: '先明确决策问题。',
        projectIds: [project.id],
        capabilityIds: [capability.id],
        occurrenceCount: 2,
        status: 'active',
      });

      expect(question.projectIds).toEqual([project.id]);
      expect(question.capabilityIds).toEqual([capability.id]);
      expect(() => assets.saveQuestion({
        ...question,
        projectIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      })).toThrow();
      expect(assets.getQuestion(question.id).projectIds).toEqual([project.id]);
    } finally {
      db.close();
    }
  });
});
