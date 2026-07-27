// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createProposalsRepository } from '../../src/main/repositories/proposals';
import { createTestDatabase } from '../helpers/database';

const originalProject = {
  name: '增长实验',
  background: '新用户留存偏低',
  goal: '提升次日留存',
  role: '产品负责人',
  keyDecisions: '缩短首次体验路径',
  outcome: '次日留存提升 8%',
  evidence: '留存看板',
  reflections: '实验分层仍可优化',
  storytellingVersions: '',
};

describe('proposals repository', () => {
  it('accepts an update proposal after snapshotting exactly one prior asset version', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const proposals = createProposalsRepository(db);
      const project = assets.saveProject(originalProject);
      const proposal = proposals.create({
        targetType: 'project',
        targetId: project.id,
        operation: 'update',
        payload: { ...originalProject, outcome: '次日留存提升 12%' },
        rationale: '面试复盘补充了量化结果',
        positionId: null,
        interviewId: null,
      });

      const accepted = proposals.accept(proposal.id, {
        ...originalProject,
        outcome: '次日留存提升 10%',
      });

      expect(accepted.status).toBe('accepted');
      expect(assets.getProject(project.id).outcome).toBe('次日留存提升 10%');
      const versions = assets.listVersions('project', project.id);
      expect(versions).toHaveLength(1);
      expect(JSON.parse(versions[0].snapshot)).toMatchObject(originalProject);
    } finally {
      db.close();
    }
  });

  it('accepts an unchanged project proposal without manufacturing a history version', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const proposals = createProposalsRepository(db);
      const project = assets.saveProject(originalProject);
      const proposal = proposals.create({
        targetType: 'project',
        targetId: project.id,
        operation: 'update',
        payload: originalProject,
        rationale: '复核现有叙事',
        positionId: null,
        interviewId: null,
      });

      expect(proposals.accept(proposal.id, originalProject).status).toBe('accepted');
      expect(assets.listVersions('project', project.id)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('accepts a create proposal and stores its new target ID', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const proposals = createProposalsRepository(db);
      const proposal = proposals.create({
        targetType: 'project',
        targetId: null,
        operation: 'create',
        payload: originalProject,
        rationale: '从面试复盘沉淀项目',
        positionId: null,
        interviewId: null,
      });

      const accepted = proposals.accept(proposal.id, originalProject);

      expect(accepted.status).toBe('accepted');
      expect(accepted.targetId).not.toBeNull();
      expect(assets.getProject(accepted.targetId!)).toMatchObject(originalProject);
      expect(assets.listVersions('project', accepted.targetId!)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('rolls back proposal and asset changes when acceptance fails', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const proposals = createProposalsRepository(db);
      const project = assets.saveProject(originalProject);
      const proposal = proposals.create({
        targetType: 'project',
        targetId: project.id,
        operation: 'update',
        payload: { ...originalProject, name: '建议名称' },
        rationale: '测试事务回滚',
        positionId: null,
        interviewId: null,
      });

      db.prepare(`
        CREATE TRIGGER reject_project_update
        BEFORE UPDATE ON projects
        BEGIN
          SELECT RAISE(ABORT, 'forced failure');
        END
      `).run();

      expect(() => proposals.accept(proposal.id, {
        ...originalProject,
        name: '不应保存',
      })).toThrow();
      expect(proposals.get(proposal.id).status).toBe('pending');
      expect(assets.getProject(project.id)).toMatchObject(originalProject);
      expect(assets.listVersions('project', project.id)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('rejects repeated acceptance as a conflict without creating more assets', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const proposals = createProposalsRepository(db);
      const proposal = proposals.create({
        targetType: 'project',
        targetId: null,
        operation: 'create',
        payload: originalProject,
        rationale: '沉淀项目',
        positionId: null,
        interviewId: null,
      });
      const accepted = proposals.accept(proposal.id, originalProject);

      expect(() => proposals.accept(proposal.id, {
        ...originalProject,
        name: '不应创建',
      })).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
      expect(proposals.get(proposal.id)).toEqual(accepted);
      expect(assets.listProjects()).toHaveLength(1);
      expect(assets.listProjects()[0].name).toBe(originalProject.name);
    } finally {
      db.close();
    }
  });

  it('rejects repeated ignore as a conflict without changing resolution state', () => {
    const db = createTestDatabase();

    try {
      const proposals = createProposalsRepository(db);
      const proposal = proposals.create({
        targetType: 'project',
        targetId: null,
        operation: 'create',
        payload: originalProject,
        rationale: '忽略建议',
        positionId: null,
        interviewId: null,
      });
      const ignored = proposals.ignore(proposal.id);

      expect(() => proposals.ignore(proposal.id))
        .toThrow(expect.objectContaining({ code: 'CONFLICT' }));
      expect(proposals.get(proposal.id)).toEqual(ignored);
    } finally {
      db.close();
    }
  });

  it('rejects question proposals with missing linked assets and rolls back acceptance', () => {
    const db = createTestDatabase();

    try {
      const assets = createAssetsRepository(db);
      const proposals = createProposalsRepository(db);
      const question = assets.saveQuestion({
        type: 'interviewer',
        text: '如何判断需求优先级？',
        answerDraft: '先看目标与风险。',
        projectIds: [],
        capabilityIds: [],
        occurrenceCount: 1,
        status: 'active',
      });
      const proposal = proposals.create({
        targetType: 'question',
        targetId: question.id,
        operation: 'update',
        payload: {
          ...question,
          projectIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
          capabilityIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
        },
        rationale: '关联复盘证据',
        positionId: null,
        interviewId: null,
      });

      expect(() => proposals.accept(proposal.id, proposal.payload))
        .toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
      expect(proposals.get(proposal.id).status).toBe('pending');
      expect(assets.getQuestion(question.id)).toMatchObject({
        projectIds: [],
        capabilityIds: [],
      });
      expect(assets.listVersions('question', question.id)).toEqual([]);
    } finally {
      db.close();
    }
  });
});
