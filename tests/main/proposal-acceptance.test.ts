// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createAssetsRepository } from '../../src/main/repositories/assets';
import { createProposalsRepository } from '../../src/main/repositories/proposals';
import { createTestDatabase } from '../helpers/database';

const project = {
  name: '检索项目',
  background: '用户难以找到信息。',
  goal: '缩短检索时间。',
  role: '产品负责人',
  keyDecisions: '优先做召回率评估。',
  outcome: '检索耗时下降。',
  evidence: '线上数据。',
  reflections: '需要更早做基线。',
  storytellingVersions: '两分钟版本。',
  unclassifiedNotes: '',
};

describe('controlled proposal acceptance', () => {
  it('uses the suggested payload for direct accept and an edited payload for edit accept', () => {
    const db = createTestDatabase();
    try {
      const proposals = createProposalsRepository(db);
      const assets = createAssetsRepository(db);
      const direct = proposals.create({
        targetType: 'project',
        targetId: null,
        operation: 'create',
        payload: project,
        rationale: '沉淀项目',
        positionId: null,
        interviewId: null,
      });
      const edited = proposals.create({
        targetType: 'project',
        targetId: null,
        operation: 'create',
        payload: project,
        rationale: '沉淀另一个项目',
        positionId: null,
        interviewId: null,
      });

      const acceptedDirect = proposals.accept(direct.id);
      const acceptedEdited = proposals.accept(edited.id, { ...project, name: '用户修改后的项目' });

      expect(acceptedDirect.acceptedPayload).toEqual(project);
      expect(acceptedEdited.acceptedPayload).toEqual({ ...project, name: '用户修改后的项目' });
      expect(assets.listProjects().map((item) => item.name))
        .toEqual(expect.arrayContaining(['检索项目', '用户修改后的项目']));
    } finally {
      db.close();
    }
  });

  it('rejects incomplete or unknown fields in edited acceptance payloads', () => {
    const db = createTestDatabase();
    try {
      const proposals = createProposalsRepository(db);
      const assets = createAssetsRepository(db);
      const proposal = proposals.create({
        targetType: 'project',
        targetId: null,
        operation: 'create',
        payload: project,
        rationale: '严格校验编辑后的内容',
        positionId: null,
        interviewId: null,
      });

      expect(() => proposals.accept(proposal.id, { ...project, unexpected: true })).toThrow();
      expect(() => proposals.accept(proposal.id, { name: project.name })).toThrow();
      expect(proposals.get(proposal.id).status).toBe('pending');
      expect(assets.listProjects()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('ignores without writing assets and rejects invalid, repeated, or concurrent resolution', async () => {
    const db = createTestDatabase();
    try {
      const proposals = createProposalsRepository(db);
      const assets = createAssetsRepository(db);
      const ignored = proposals.create({
        targetType: 'project',
        targetId: null,
        operation: 'create',
        payload: project,
        rationale: '不采用',
        positionId: null,
        interviewId: null,
      });
      proposals.ignore(ignored.id);
      expect(assets.listProjects()).toEqual([]);
      expect(() => proposals.accept(ignored.id)).toThrow();

      const pending = proposals.create({
        targetType: 'project',
        targetId: null,
        operation: 'create',
        payload: project,
        rationale: '并发测试',
        positionId: null,
        interviewId: null,
      });
      expect(() => proposals.accept(pending.id, { name: '' })).toThrow();
      expect(proposals.get(pending.id).status).toBe('pending');
      const results = await Promise.allSettled([
        Promise.resolve().then(() => proposals.accept(pending.id)),
        Promise.resolve().then(() => proposals.ignore(pending.id)),
      ]);
      expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
      expect(assets.listProjects()).toHaveLength(
        proposals.get(pending.id).status === 'accepted' ? 1 : 0,
      );
    } finally {
      db.close();
    }
  });

  it('versions project updates and validates question associations atomically', () => {
    const db = createTestDatabase();
    try {
      const proposals = createProposalsRepository(db);
      const assets = createAssetsRepository(db);
      const existing = assets.saveProject(project);
      const update = proposals.create({
        targetType: 'project',
        targetId: existing.id,
        operation: 'update',
        payload: { ...project, background: '复盘后补充的背景。' },
        rationale: '补充背景',
        positionId: null,
        interviewId: null,
      });
      proposals.accept(update.id);
      expect(assets.getProject(existing.id).background).toBe('复盘后补充的背景。');
      expect(assets.listVersions('project', existing.id)).toHaveLength(1);

      const capability = assets.saveCapability({
        name: '问题拆解',
        jdFrequency: 1,
        evidence: '面试记录',
        gaps: '',
        mergedIntoId: null,
      });
      const validQuestion = proposals.create({
        targetType: 'question',
        targetId: null,
        operation: 'create',
        payload: {
          type: 'candidate',
          text: '团队如何定义成功？',
          answerDraft: '',
          projectIds: [existing.id],
          capabilityIds: [capability.id],
          occurrenceCount: 0,
          status: 'active',
        },
        rationale: '候选人反问',
        positionId: null,
        interviewId: null,
      });
      const acceptedQuestion = proposals.accept(validQuestion.id);
      expect(assets.getQuestion(acceptedQuestion.targetId!)).toMatchObject({
        type: 'candidate',
        projectIds: [existing.id],
        capabilityIds: [capability.id],
      });

      const invalidQuestion = proposals.create({
        targetType: 'question',
        targetId: null,
        operation: 'create',
        payload: {
          type: 'candidate',
          text: '团队如何定义成功？',
          answerDraft: '',
          projectIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
          capabilityIds: [],
          occurrenceCount: 0,
          status: 'active',
        },
        rationale: '候选人反问',
        positionId: null,
        interviewId: null,
      });
      expect(() => proposals.accept(invalidQuestion.id)).toThrow();
      expect(proposals.get(invalidQuestion.id).status).toBe('pending');
      expect(assets.listQuestions()).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('treats merge payload as the explicit final asset and snapshots the retained asset', () => {
    const db = createTestDatabase();
    try {
      const proposals = createProposalsRepository(db);
      const assets = createAssetsRepository(db);
      const existing = assets.saveCapability({
        name: '战略思考',
        jdFrequency: 2,
        evidence: '旧证据',
        gaps: '缺少长期规划案例',
        mergedIntoId: null,
      });
      const finalMergedPayload = {
        name: '战略思考',
        jdFrequency: 3,
        evidence: '旧证据\n本次面试中的新证据',
        gaps: '需要量化长期影响',
        mergedIntoId: null,
      };
      const merge = proposals.create({
        targetType: 'capability',
        targetId: existing.id,
        operation: 'merge',
        payload: finalMergedPayload,
        rationale: '把新证据合入已有能力主题',
        positionId: null,
        interviewId: null,
      });

      proposals.accept(merge.id);

      expect(assets.getCapability(existing.id)).toMatchObject(finalMergedPayload);
      const versions = assets.listVersions('capability', existing.id);
      expect(versions).toHaveLength(1);
      expect(JSON.parse(versions[0].snapshot)).toMatchObject({
        evidence: '旧证据',
        jdFrequency: 2,
      });
    } finally {
      db.close();
    }
  });

  it('keeps identical merge proposals pending for every asset type', () => {
    const db = createTestDatabase();
    try {
      const proposals = createProposalsRepository(db);
      const assets = createAssetsRepository(db);
      const projectAsset = assets.saveProject(project);
      const capabilityAsset = assets.saveCapability({
        name: '问题拆解',
        jdFrequency: 1,
        evidence: '面试证据',
        gaps: '',
        mergedIntoId: null,
      });
      const questionAsset = assets.saveQuestion({
        type: 'interviewer',
        text: '如何判断需求优先级？',
        answerDraft: '目标、风险与证据。',
        projectIds: [projectAsset.id],
        capabilityIds: [capabilityAsset.id],
        occurrenceCount: 1,
        status: 'active',
      });
      const insightAsset = assets.saveInsight({
        title: '表达顺序',
        content: '先说结论。',
        positionId: null,
        projectId: projectAsset.id,
        questionId: questionAsset.id,
        capabilityId: capabilityAsset.id,
      });
      const cases = [
        ['project', projectAsset.id, projectAsset],
        ['question', questionAsset.id, {
          ...questionAsset,
          projectIds: [...questionAsset.projectIds].reverse(),
          capabilityIds: [...questionAsset.capabilityIds].reverse(),
        }],
        ['capability', capabilityAsset.id, capabilityAsset],
        ['insight', insightAsset.id, insightAsset],
      ] as const;

      for (const [targetType, targetId, entity] of cases) {
        const {
          id: _id,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...payload
        } = entity;
        const proposal = proposals.create({
          targetType,
          targetId,
          operation: 'merge',
          payload,
          rationale: '不应接受的无变化合并',
          positionId: null,
          interviewId: null,
        });
        expect(() => proposals.accept(proposal.id))
          .toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
        expect(proposals.get(proposal.id).status).toBe('pending');
        expect(assets.listVersions(targetType, targetId)).toEqual([]);
      }
    } finally {
      db.close();
    }
  });
});
