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
  it('merges active capabilities transactionally and rewrites every live relation', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const target = assets.saveCapability({
        name: '目标能力',
        jdFrequency: 5,
        evidence: '目标证据\n\n共同证据',
        gaps: '目标差距',
        mergedIntoId: null,
      });
      const source = assets.saveCapability({
        name: '来源能力',
        jdFrequency: 3,
        evidence: '共同证据\n\n来源证据',
        gaps: '来源差距\n\n目标差距',
        mergedIntoId: null,
      });
      const untouched = assets.saveCapability({
        name: '其他能力',
        jdFrequency: 2,
        evidence: '',
        gaps: '',
        mergedIntoId: null,
      });
      const child = assets.saveCapability({
        name: '历史子能力',
        jdFrequency: 1,
        evidence: '',
        gaps: '',
        mergedIntoId: source.id,
      });
      const question = assets.saveQuestion({
        type: 'interviewer',
        text: '如何解决复杂问题？',
        answerDraft: '',
        projectIds: [],
        capabilityIds: [untouched.id, source.id, target.id, source.id],
        occurrenceCount: 1,
        status: 'active',
      });
      const insight = assets.saveInsight({
        title: '一次复盘',
        content: '能力关联需要迁移',
        positionId: null,
        projectId: null,
        questionId: question.id,
        capabilityId: source.id,
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

      const merged = assets.mergeCapabilities(source.id, target.id);

      expect(merged.source.mergedIntoId).toBe(target.id);
      expect(merged.target).toMatchObject({
        id: target.id,
        jdFrequency: 8,
        evidence: '目标证据\n\n共同证据\n\n来源证据',
        gaps: '目标差距\n\n来源差距',
      });
      expect(assets.getQuestion(question.id).capabilityIds).toEqual([
        untouched.id,
        target.id,
      ]);
      expect(assets.getInsight(insight.id).capabilityId).toBe(target.id);
      expect(assets.getCapability(child.id).mergedIntoId).toBe(target.id);
      expect(db.prepare('SELECT capability_id FROM capability_evidence WHERE id = ?')
        .get('99999999-9999-4999-8999-999999999999')).toEqual({
        capability_id: target.id,
      });
      expect(assets.listCapabilities().map(({ id }) => id)).toEqual([
        target.id,
        untouched.id,
      ]);
      expect(assets.listVersions('capability', source.id)).toHaveLength(1);
      expect(assets.listVersions('capability', target.id)).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('rejects invalid capability merge targets without changing active records', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const source = assets.saveCapability({
        name: '来源能力',
        jdFrequency: 1,
        evidence: '',
        gaps: '',
        mergedIntoId: null,
      });
      const target = assets.saveCapability({
        name: '目标能力',
        jdFrequency: 2,
        evidence: '',
        gaps: '',
        mergedIntoId: null,
      });
      const alreadyMerged = assets.saveCapability({
        name: '已合并能力',
        jdFrequency: 3,
        evidence: '',
        gaps: '',
        mergedIntoId: target.id,
      });

      expect(() => assets.mergeCapabilities(source.id, source.id)).toThrow();
      expect(() => assets.mergeCapabilities(source.id, alreadyMerged.id)).toThrow();
      expect(() => assets.mergeCapabilities(alreadyMerged.id, target.id)).toThrow();
      expect(() => assets.mergeCapabilities(source.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
        .toThrow();
      expect(assets.getCapability(source.id).mergedIntoId).toBeNull();
      expect(assets.getCapability(target.id).jdFrequency).toBe(2);
    } finally {
      db.close();
    }
  });

  it('rolls back every capability merge update when a relation rewrite fails', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const source = assets.saveCapability({
        name: '来源能力',
        jdFrequency: 1,
        evidence: '来源',
        gaps: '',
        mergedIntoId: null,
      });
      const target = assets.saveCapability({
        name: '目标能力',
        jdFrequency: 2,
        evidence: '目标',
        gaps: '',
        mergedIntoId: null,
      });
      const insight = assets.saveInsight({
        title: '阻断更新',
        content: '用于故障注入',
        positionId: null,
        projectId: null,
        questionId: null,
        capabilityId: source.id,
      });
      db.exec(`
        CREATE TRIGGER fail_capability_merge
        BEFORE UPDATE OF capability_id ON insights
        WHEN OLD.capability_id = '${source.id}'
        BEGIN
          SELECT RAISE(ABORT, 'injected merge failure');
        END;
      `);

      expect(() => assets.mergeCapabilities(source.id, target.id))
        .toThrow('injected merge failure');
      expect(assets.getCapability(source.id).mergedIntoId).toBeNull();
      expect(assets.getCapability(target.id)).toMatchObject({
        jdFrequency: 2,
        evidence: '目标',
      });
      expect(assets.getInsight(insight.id).capabilityId).toBe(source.id);
      expect(assets.listVersions('capability', source.id)).toEqual([]);
      expect(assets.listVersions('capability', target.id)).toEqual([]);
    } finally {
      db.close();
    }
  });

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
