import { describe, expect, it } from 'vitest';
import {
  canonicalizePreparationJobData,
  preparationOutboundPreviewSchema,
} from '../../src/shared/schemas';

const project = {
  updatedAt: '2026-07-02T00:00:00.000Z',
  storytellingVersions: '两分钟版本',
  reflections: '更早验证',
  evidence: '访谈记录',
  outcome: '指标提升',
  keyDecisions: '先验证',
  role: '负责人',
  goal: '提升留存',
  background: '用户不知道第一步',
  name: '无断点项目名🙂',
  createdAt: '2026-07-01T00:00:00.000Z',
  id: '22222222-2222-4222-8222-222222222222',
};

const question = {
  updatedAt: '2026-07-02T00:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  status: 'active',
  occurrenceCount: 1,
  capabilityIds: [],
  projectIds: [project.id],
  answerDraft: '先验证高风险假设',
  text: '如何验证智能🙂需求？',
  type: 'interviewer',
  id: '33333333-3333-4333-8333-333333333333',
};

describe('preparation outbound preview schema', () => {
  it('canonicalizes key order while preserving array order and Unicode', () => {
    const first = canonicalizePreparationJobData(
      { rawJd: '需要理解智能🙂产品', title: 'AI 产品经理', company: '远山科技' },
      { questions: [question], projects: [project] },
    );
    const second = canonicalizePreparationJobData(
      { company: '远山科技', title: 'AI 产品经理', rawJd: '需要理解智能🙂产品' },
      {
        projects: [{ ...project }],
        questions: [{ ...question }],
      },
    );

    expect(first.jobDataJson).toBe(second.jobDataJson);
    expect(first.jobDataJson).toContain('智能🙂');
    expect(preparationOutboundPreviewSchema.safeParse({
      prompt: '精确 Prompt',
      ...first,
    }).success).toBe(true);

    const otherProject = {
      ...project,
      id: '44444444-4444-4444-8444-444444444444',
      name: '第二个项目',
    };
    const ordered = canonicalizePreparationJobData(
      first.position,
      {
        projects: [project, otherProject],
        questions: [question],
      },
    );
    const reversed = canonicalizePreparationJobData(
      first.position,
      {
        projects: [otherProject, project],
        questions: [question],
      },
    );
    expect(reversed.jobDataJson).not.toBe(ordered.jobDataJson);
  });

  it('rejects a tampered serialized payload without weakening nested validation', () => {
    const canonical = canonicalizePreparationJobData(
      { company: '远山科技', title: 'AI 产品经理', rawJd: '完整 JD' },
      { projects: [project], questions: [question] },
    );

    expect(preparationOutboundPreviewSchema.safeParse({
      prompt: '精确 Prompt',
      ...canonical,
      jobDataJson: '{}',
    }).success).toBe(false);
    expect(preparationOutboundPreviewSchema.safeParse({
      prompt: '精确 Prompt',
      ...canonical,
      selectedAssets: {
        ...canonical.selectedAssets,
        projects: [{ ...canonical.selectedAssets.projects[0], unknown: true }],
      },
    }).success).toBe(false);
  });
});
