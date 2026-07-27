import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import type {
  AssetVersion,
  Capability,
  Insight,
  PositionListItem,
  Project,
  Question,
} from '../../src/shared/domain';
import {
  createJobSearchFake,
  installJobSearchFake,
  type JobSearchApiFake,
} from '../helpers/bridge';

const projectId = '11111111-1111-4111-8111-111111111111';
const capabilityId = '22222222-2222-4222-8222-222222222222';
const interviewerQuestionId = '33333333-3333-4333-8333-333333333333';
const candidateQuestionId = '44444444-4444-4444-8444-444444444444';
const positionId = '55555555-5555-4555-8555-555555555555';

const project: Project = {
  id: projectId,
  name: '增长实验',
  background: '新用户不知道第一步该做什么',
  goal: '提升首周留存',
  role: '产品负责人',
  keyDecisions: '先验证引导路径',
  outcome: '首周留存提升 8%',
  evidence: '实验数据与访谈记录',
  reflections: '应更早建立对照组',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const capability: Capability = {
  id: capabilityId,
  name: '用户研究',
  jdFrequency: 3,
  evidence: '完成 12 次访谈',
  gaps: '缺少国际化样本',
  mergedIntoId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const interviewerQuestion: Question = {
  id: interviewerQuestionId,
  type: 'interviewer',
  text: '如何设计用户研究？',
  answerDraft: '先明确决策问题。',
  projectIds: [projectId],
  capabilityIds: [capabilityId],
  occurrenceCount: 2,
  status: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const candidateQuestion: Question = {
  ...interviewerQuestion,
  id: candidateQuestionId,
  type: 'candidate',
  text: '团队如何定义产品成功？',
  projectIds: [],
  capabilityIds: [],
  occurrenceCount: 0,
};

const position: PositionListItem = {
  id: positionId,
  company: '远山科技',
  title: '产品经理',
  interest: 5,
  currentStage: 'interview',
  finalResult: null,
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const insight: Insight = {
  id: '66666666-6666-4666-8666-666666666666',
  title: '表达要从结论开始',
  content: '先说判断，再补证据。',
  positionId,
  projectId,
  questionId: interviewerQuestionId,
  capabilityId,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const version: AssetVersion = {
  id: '77777777-7777-4777-8777-777777777777',
  assetType: 'project',
  assetId: projectId,
  version: 1,
  snapshot: JSON.stringify({ ...project, background: '旧背景' }),
  createdAt: '2026-07-01T00:00:00.000Z',
};

function renderAt(hash: string, configure?: (fake: JobSearchApiFake) => void) {
  window.location.hash = hash;
  const fake = createJobSearchFake();
  fake.assets.projects.list.mockResolvedValue([project]);
  fake.assets.projects.get.mockResolvedValue(project);
  fake.assets.projects.save.mockResolvedValue(project);
  fake.assets.questions.list.mockImplementation(async (type) => (
    type === 'candidate' ? [candidateQuestion] : [interviewerQuestion]
  ));
  fake.assets.questions.get.mockImplementation(async (id) => (
    id === candidateQuestionId ? candidateQuestion : interviewerQuestion
  ));
  fake.assets.questions.save.mockResolvedValue(interviewerQuestion);
  fake.assets.capabilities.list.mockResolvedValue([capability]);
  fake.assets.capabilities.get.mockResolvedValue(capability);
  fake.assets.capabilities.save.mockResolvedValue(capability);
  fake.assets.insights.list.mockResolvedValue([insight]);
  fake.assets.insights.get.mockResolvedValue(insight);
  fake.assets.insights.save.mockResolvedValue(insight);
  fake.assets.versions.mockResolvedValue([version]);
  fake.positions.list.mockResolvedValue([position]);
  configure?.(fake);
  installJobSearchFake(fake);
  return { fake, user: userEvent.setup(), ...render(<App />) };
}

describe('reusable assets flow', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('creates and edits the exact project narrative fields and shows read-only history', async () => {
    const { fake, user } = renderAt('#/projects');

    expect(await screen.findByRole('heading', { name: '增长实验' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看 增长实验' }));
    expect(screen.getByText('旧背景')).toBeInTheDocument();
    expect(screen.getByText('历史版本 1')).toBeInTheDocument();
    expect(screen.getByText('只读历史')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '编辑项目' }));
    const editor = screen.getByRole('dialog', { name: '编辑项目' });
    for (const label of [
      '项目名称', '背景', '目标', '角色', '关键决策', '结果', '证据', '反思',
    ]) {
      expect(within(editor).getByLabelText(new RegExp(label))).toBeInTheDocument();
    }
    await user.clear(within(editor).getByLabelText(/背景/));
    await user.type(within(editor).getByLabelText(/背景/), '新的项目背景');
    await user.click(within(editor).getByRole('button', { name: '保存项目' }));

    await waitFor(() => expect(fake.assets.projects.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: projectId,
        background: '新的项目背景',
        outcome: '首周留存提升 8%',
        evidence: '实验数据与访谈记录',
      }),
    ));
  });

  it('keeps project form values after a failed create mutation', async () => {
    const { fake, user } = renderAt('#/projects', (api) => {
      api.assets.projects.save.mockRejectedValue(new Error('SQL secret'));
    });

    await user.click(await screen.findByRole('button', { name: '新增项目' }));
    const editor = screen.getByRole('dialog', { name: '新增项目' });
    await user.type(within(editor).getByLabelText(/项目名称/), '新的证据项目');
    await user.type(within(editor).getByLabelText(/背景/), '用户流失');
    await user.click(within(editor).getByRole('button', { name: '保存项目' }));

    expect(await screen.findByText('保存项目失败，请稍后重试')).toBeInTheDocument();
    expect(within(editor).getByLabelText(/项目名称/)).toHaveValue('新的证据项目');
    expect(fake.assets.projects.save).toHaveBeenCalled();
  });

  it('keeps interviewer and candidate libraries isolated with independent create entries', async () => {
    const { fake, user } = renderAt('#/questions');

    const interviewerTab = await screen.findByRole('tab', { name: '面试官问题' });
    const candidateTab = screen.getByRole('tab', { name: '候选人反问' });
    expect(screen.getByRole('button', { name: '新增面试官问题' })).toBeInTheDocument();
    expect(screen.queryByText('团队如何定义产品成功？')).not.toBeInTheDocument();
    expect(screen.getByText('如何设计用户研究？')).toBeInTheDocument();

    await user.click(candidateTab);
    expect(await screen.findByText('团队如何定义产品成功？')).toBeInTheDocument();
    expect(screen.queryByText('如何设计用户研究？')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增候选人反问' })).toBeInTheDocument();
    expect(interviewerTab).toHaveAttribute('aria-selected', 'false');
    expect(fake.assets.questions.list).toHaveBeenLastCalledWith('candidate');
  });

  it('supports keyboard navigation between the two question libraries', async () => {
    const { user } = renderAt('#/questions');
    const interviewerTab = await screen.findByRole('tab', { name: '面试官问题' });
    const candidateTab = screen.getByRole('tab', { name: '候选人反问' });

    interviewerTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(candidateTab).toHaveFocus();
    expect(candidateTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(interviewerTab).toHaveFocus();
    expect(interviewerTab).toHaveAttribute('aria-selected', 'true');
  });

  it('creates a typed question with links and a non-negative occurrence count', async () => {
    const { fake, user } = renderAt('#/questions');

    await user.click(await screen.findByRole('button', { name: '新增面试官问题' }));
    const editor = screen.getByRole('dialog', { name: '新增面试官问题' });
    await user.type(within(editor).getByLabelText(/问题文本/), '怎样验证需求？');
    await user.type(within(editor).getByLabelText(/回答草稿/), '从风险最大的假设开始。');
    await user.click(within(editor).getByRole('checkbox', { name: '关联项目：增长实验' }));
    await user.click(within(editor).getByRole('checkbox', { name: '关联能力：用户研究' }));
    await user.clear(within(editor).getByRole('spinbutton', { name: /出现次数/ }));
    await user.type(within(editor).getByRole('spinbutton', { name: /出现次数/ }), '3');
    await user.click(within(editor).getByRole('button', { name: '保存问题' }));

    await waitFor(() => expect(fake.assets.questions.save).toHaveBeenCalledWith({
      type: 'interviewer',
      text: '怎样验证需求？',
      answerDraft: '从风险最大的假设开始。',
      projectIds: [projectId],
      capabilityIds: [capabilityId],
      occurrenceCount: 3,
      status: 'active',
    }));
  });

  it('shows and edits capability evidence, frequency, and gaps', async () => {
    const { fake, user } = renderAt('#/capabilities');

    expect(await screen.findByRole('heading', { name: '用户研究' })).toBeInTheDocument();
    expect(screen.getByText('JD 频次 3')).toBeInTheDocument();
    expect(screen.getByText('完成 12 次访谈')).toBeInTheDocument();
    expect(screen.getByText('缺少国际化样本')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '编辑能力 用户研究' }));
    const editor = screen.getByRole('dialog', { name: '编辑能力' });
    await user.clear(within(editor).getByRole('spinbutton', { name: /JD 频次/ }));
    await user.type(within(editor).getByRole('spinbutton', { name: /JD 频次/ }), '4');
    await user.click(within(editor).getByRole('button', { name: '保存能力' }));

    await waitFor(() => expect(fake.assets.capabilities.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: capabilityId, jdFrequency: 4 }),
    ));
  });

  it('saves free-text insights with optional links and preserves failures', async () => {
    const { fake, user } = renderAt('#/insights', (api) => {
      api.assets.insights.save.mockRejectedValue(new Error('disk failed'));
    });

    await user.click(await screen.findByRole('button', { name: '新增心得' }));
    const editor = screen.getByRole('dialog', { name: '新增心得' });
    await user.type(within(editor).getByLabelText(/标题/), '新的表达心得');
    await user.type(within(editor).getByLabelText(/自由文本/), '先给结论，再补证据。');
    await user.selectOptions(within(editor).getByLabelText('关联岗位（可选）'), positionId);
    await user.selectOptions(within(editor).getByLabelText('关联项目（可选）'), projectId);
    await user.selectOptions(within(editor).getByLabelText('关联问题（可选）'), interviewerQuestionId);
    await user.selectOptions(within(editor).getByLabelText('关联能力（可选）'), capabilityId);
    await user.click(within(editor).getByRole('button', { name: '保存心得' }));

    await waitFor(() => expect(fake.assets.insights.save).toHaveBeenCalledWith({
      title: '新的表达心得',
      content: '先给结论，再补证据。',
      positionId,
      projectId,
      questionId: interviewerQuestionId,
      capabilityId,
    }));
    expect(await screen.findByText('保存心得失败，请稍后重试')).toBeInTheDocument();
    expect(within(editor).getByLabelText(/自由文本/)).toHaveValue('先给结论，再补证据。');
  });

  it.each([
    ['#/projects', 'projects', '项目档案载入失败'],
    ['#/questions', 'questions', '问题库载入失败'],
    ['#/capabilities', 'capabilities', '能力主题载入失败'],
    ['#/insights', 'insights', '心得载入失败'],
  ] as const)('shows a safe route-isolated error at %s', async (hash, area, heading) => {
    const view = renderAt(hash, (api) => {
      if (area === 'projects') api.assets.projects.list.mockRejectedValue(new Error('SQL secret'));
      if (area === 'questions') api.assets.questions.list.mockRejectedValue(new Error('SQL secret'));
      if (area === 'capabilities') api.assets.capabilities.list.mockRejectedValue(new Error('SQL secret'));
      if (area === 'insights') api.assets.insights.list.mockRejectedValue(new Error('SQL secret'));
    });

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.queryByText(/SQL secret/)).not.toBeInTheDocument();
    view.unmount();
  });

  it.each([
    ['#/projects', 'projects', '正在读取项目档案…'],
    ['#/questions', 'questions', '正在读取问题库…'],
    ['#/capabilities', 'capabilities', '正在读取能力主题…'],
    ['#/insights', 'insights', '正在读取心得…'],
  ] as const)('announces a route-isolated loading state at %s', (hash, area, label) => {
    const pending = new Promise<never>(() => undefined);
    const view = renderAt(hash, (api) => {
      if (area === 'projects') api.assets.projects.list.mockReturnValue(pending);
      if (area === 'questions') api.assets.questions.list.mockReturnValue(pending);
      if (area === 'capabilities') api.assets.capabilities.list.mockReturnValue(pending);
      if (area === 'insights') api.assets.insights.list.mockReturnValue(pending);
    });

    expect(screen.getByRole('status')).toHaveTextContent(label);
    view.unmount();
  });

  it.each([
    ['#/projects', 'projects', '还没有项目档案'],
    ['#/questions', 'questions', '还没有面试官问题'],
    ['#/capabilities', 'capabilities', '还没有能力主题'],
    ['#/insights', 'insights', '还没有随想与心得'],
  ] as const)('offers a useful empty state at %s', async (hash, area, heading) => {
    const view = renderAt(hash, (api) => {
      if (area === 'projects') api.assets.projects.list.mockResolvedValue([]);
      if (area === 'questions') api.assets.questions.list.mockResolvedValue([]);
      if (area === 'capabilities') api.assets.capabilities.list.mockResolvedValue([]);
      if (area === 'insights') api.assets.insights.list.mockResolvedValue([]);
    });

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    view.unmount();
  });
});
