import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/App';
import type {
  ChangeProposal,
  ChangeProposalListItem,
  Interview,
  InterviewReviewPreview,
  PositionDetail,
  Project,
} from '../../src/shared/domain';
import { installJobSearchFake, resetJobSearchFake } from '../helpers/bridge';

const positionId = '11111111-1111-4111-8111-111111111111';
const interviewId = '22222222-2222-4222-8222-222222222222';
const proposalId = '33333333-3333-4333-8333-333333333333';

const position: PositionDetail = {
  id: positionId,
  company: '远山科技',
  title: 'AI 产品经理',
  location: '',
  interest: 5,
  rawJd: '负责 AI 产品规划。',
  currentStage: 'interview',
  finalResult: null,
  createdAt: '2026-07-27T08:00:00.000Z',
  updatedAt: '2026-07-27T08:00:00.000Z',
  stages: [],
  interviews: [],
};

const interview: Interview = {
  id: interviewId,
  positionId,
  roundName: '业务一面',
  interviewDate: '2026-07-27',
  transcript: '面试官问我如何判断需求优先级。',
  personalNotes: '回答得有些散。',
  summary: null,
  reviewSnapshot: { status: 'none' },
  feedbackResult: null,
  createdAt: '2026-07-27T09:00:00.000Z',
  updatedAt: '2026-07-27T09:00:00.000Z',
};

const preview: InterviewReviewPreview = {
  token: '44444444-4444-4444-8444-444444444444',
  provider: 'https://api.example.com',
  model: 'model-review',
  inputHash: 'a'.repeat(64),
  positionLabel: '远山科技 · AI 产品经理',
  roundName: '业务一面',
  outbound: {
    position: {
      id: position.id,
      company: position.company,
      title: position.title,
      location: position.location,
      rawJd: position.rawJd,
    },
    interview: {
      id: interview.id,
      positionId: interview.positionId,
      roundName: interview.roundName,
      interviewDate: interview.interviewDate,
      transcript: interview.transcript,
      personalNotes: interview.personalNotes,
      feedbackResult: interview.feedbackResult,
    },
    prompt: '请基于事实复盘面试。',
    selectedAssets: {
      projects: [],
      questions: [],
      capabilities: [],
      insights: [],
    },
  },
  dataTypes: ['面试文字记录', '个人感受与补充', '岗位信息与原始 JD', '面试复盘 Prompt'],
};

const proposal: ChangeProposalListItem = {
  id: proposalId,
  targetType: 'question',
  targetId: null,
  operation: 'create',
  payload: {
    type: 'interviewer',
    text: '你如何衡量一次需求判断的质量？',
    answerDraft: '从目标、证据和结果回答。',
    projectIds: [],
    capabilityIds: [],
    occurrenceCount: 1,
    status: 'active',
  },
  rationale: '值得沉淀为面试官问题。',
  positionId,
  interviewId,
  analysisRunId: null,
  status: 'pending',
  acceptedPayload: null,
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T10:00:00.000Z',
  resolvedAt: null,
  context: {
    position: { company: position.company, title: position.title },
    interview: { roundName: interview.roundName, interviewDate: interview.interviewDate },
  },
};

const projectAsset: Project = {
  id: '77777777-7777-4777-8777-777777777777',
  name: '求职闭环助手',
  background: '求职记录分散',
  goal: '形成复盘闭环',
  role: '产品经理',
  keyDecisions: '本地优先',
  outcome: '完成 MVP',
  evidence: '用户访谈',
  reflections: '控制范围',
  storytellingVersions: 'STAR',
  unclassifiedNotes: '',
  createdAt: '2026-07-27T08:00:00.000Z',
  updatedAt: '2026-07-27T08:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('interview and review UI', () => {
  beforeEach(() => {
    window.location.hash = `#/positions/${positionId}`;
    resetJobSearchFake();
  });

  it('creates and edits manual interview text, validates dates, retains failed values, and sorts newest first', async () => {
    const fake = resetJobSearchFake();
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.interviews.list.mockResolvedValue([
      interview,
      { ...interview, id: '44444444-4444-4444-8444-444444444444', roundName: '终面', interviewDate: '2026-07-28' },
    ]);
    fake.reviews.interviews.create.mockRejectedValueOnce(new Error('disk full'));
    fake.reviews.interviews.update.mockResolvedValue({
      ...interview,
      personalNotes: '编辑后的个人补充',
    });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { level: 4, name: '终面' });
    expect(screen.getAllByRole('heading', { level: 4 }).map((item) => item.textContent))
      .toEqual(['终面', '业务一面']);
    expect(screen.getByText('当前版本仅支持手动输入文字；录音转写将在后续阶段提供。'))
      .toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新增面试记录' }));
    await user.type(screen.getByLabelText(/轮次/), 'HR 面');
    await user.type(screen.getByLabelText('面试日期'), '2026-02-30');
    await user.type(screen.getByLabelText(/已确认文字记录/), '这段文字必须保留。');
    await user.click(screen.getByRole('button', { name: '保存面试记录' }));
    expect(await screen.findByText('请输入真实存在的日期。')).toBeInTheDocument();
    expect(screen.getByLabelText(/已确认文字记录/)).toHaveValue('这段文字必须保留。');

    await user.clear(screen.getByLabelText('面试日期'));
    await user.type(screen.getByLabelText('面试日期'), '2026-07-29');
    await user.click(screen.getByRole('button', { name: '保存面试记录' }));
    expect(await screen.findByText('保存失败，已保留你填写的内容。')).toBeInTheDocument();
    expect(screen.getByLabelText(/已确认文字记录/)).toHaveValue('这段文字必须保留。');
    await user.click(screen.getByRole('button', { name: '关闭对话框' }));
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0]);
    await user.clear(screen.getByLabelText('个人感受 / 补充'));
    await user.type(screen.getByLabelText('个人感受 / 补充'), '编辑后的个人补充');
    await user.click(screen.getByRole('button', { name: '保存面试记录' }));
    await waitFor(() => expect(fake.reviews.interviews.update).toHaveBeenCalled());
  });

  it('shows outbound review confirmation, does not auto-call AI, and confirms once', async () => {
    const fake = resetJobSearchFake();
    const detailedPreview: InterviewReviewPreview = {
      ...preview,
      outbound: {
        ...preview.outbound,
        interview: {
          ...preview.outbound.interview,
          feedbackResult: '进入下一轮',
        },
      },
    };
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.interviews.list.mockResolvedValue([interview]);
    fake.reviews.review.preview.mockResolvedValue(detailedPreview);
    fake.reviews.review.confirm.mockResolvedValue({
      interview: { ...interview, summary: '复盘完成' },
      proposals: [proposal],
    });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: '开始 AI 复盘' });
    expect(fake.reviews.review.preview).not.toHaveBeenCalled();
    expect(fake.reviews.review.confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '开始 AI 复盘' }));
    expect(await screen.findByRole('heading', { name: '选择复盘参考资产' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '预览发送内容' }));
    expect(await screen.findByRole('heading', { name: '确认发送复盘数据' })).toBeInTheDocument();
    expect(screen.getByText('https://api.example.com · model-review')).toBeInTheDocument();
    expect(screen.getByText('岗位与原始 JD')).toBeInTheDocument();
    expect(screen.getByText((content, element) => (
      element?.tagName === 'PRE'
      && content.includes(position.id)
      && content.includes(position.rawJd)
    ))).toBeInTheDocument();
    expect(screen.getByText((content, element) => (
      element?.tagName === 'PRE'
      && content.includes(interview.id)
      && content.includes(interview.positionId)
      && content.includes(interview.interviewDate ?? '')
      && content.includes('进入下一轮')
    ))).toBeInTheDocument();
    expect(fake.reviews.review.confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(fake.reviews.review.confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(fake.reviews.review.cancelPreview)
      .toHaveBeenCalledWith(preview.token));
    await user.click(screen.getByRole('button', { name: '开始 AI 复盘' }));
    await screen.findByRole('heading', { name: '选择复盘参考资产' });
    await user.click(screen.getByRole('button', { name: '预览发送内容' }));
    await screen.findByRole('heading', { name: '确认发送复盘数据' });

    await user.click(screen.getByRole('button', { name: '确认并开始复盘' }));
    await waitFor(() => expect(fake.reviews.review.confirm).toHaveBeenCalledWith(preview.token));
    expect(fake.reviews.review.confirm).toHaveBeenCalledTimes(1);
  });

  it('defaults asset selection to none, binds selected ids, shows full outbound detail, and cancels the token', async () => {
    const fake = resetJobSearchFake();
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.interviews.list.mockResolvedValue([interview]);
    fake.assets.projects.list.mockResolvedValue([projectAsset]);
    fake.reviews.review.preview.mockResolvedValue({
      ...preview,
      outbound: {
        ...preview.outbound,
        selectedAssets: {
          ...preview.outbound.selectedAssets,
          projects: [projectAsset],
        },
      },
    });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: '开始 AI 复盘' });
    await user.click(screen.getByRole('button', { name: '开始 AI 复盘' }));
    expect(await screen.findByRole('heading', { name: '选择复盘参考资产' })).toBeInTheDocument();
    const projectCheckbox = screen.getByRole('checkbox', { name: projectAsset.name });
    expect(projectCheckbox).not.toBeChecked();
    expect(fake.reviews.review.preview).not.toHaveBeenCalled();

    await user.click(projectCheckbox);
    await user.click(screen.getByRole('button', { name: '预览发送内容' }));
    await waitFor(() => expect(fake.reviews.review.preview).toHaveBeenCalledWith({
      interviewId,
      selectedAssets: {
        projectIds: [projectAsset.id],
        questionIds: [],
        capabilityIds: [],
        insightIds: [],
      },
    }));
    expect(await screen.findByRole('heading', { name: '确认发送复盘数据' })).toBeInTheDocument();
    expect(screen.getAllByText(position.rawJd).length).toBeGreaterThan(0);
    expect(screen.getAllByText(interview.transcript).length).toBeGreaterThan(0);
    expect(screen.getByText(preview.outbound.prompt)).toBeInTheDocument();
    expect(screen.getByText(projectAsset.name)).toBeInTheDocument();
    expect(screen.getByText((content, element) => (
      element?.tagName === 'PRE'
      && content.includes(projectAsset.background)
      && content.includes(projectAsset.evidence)
    ))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(fake.reviews.review.cancelPreview)
      .toHaveBeenCalledWith(preview.token));
  });

  it.each([
    ['取消按钮', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: '取消' }));
    }],
    ['关闭按钮', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: '关闭对话框' }));
    }],
  ])('discards and cancels a late preview after %s', async (_label, close) => {
    const fake = resetJobSearchFake();
    const pending = deferred<InterviewReviewPreview>();
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.interviews.list.mockResolvedValue([interview]);
    fake.reviews.review.preview.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: '开始 AI 复盘' });
    await user.click(screen.getByRole('button', { name: '开始 AI 复盘' }));
    await user.click(await screen.findByRole('button', { name: '预览发送内容' }));
    await close(user);
    pending.resolve(preview);

    await waitFor(() => expect(fake.reviews.review.cancelPreview)
      .toHaveBeenCalledWith(preview.token));
    expect(screen.queryByRole('heading', { name: '确认发送复盘数据' }))
      .not.toBeInTheDocument();
  });

  it('cancels a late preview token after the panel unmounts', async () => {
    const fake = resetJobSearchFake();
    const pending = deferred<InterviewReviewPreview>();
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.interviews.list.mockResolvedValue([interview]);
    fake.reviews.review.preview.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const view = render(<App />);

    await screen.findByRole('button', { name: '开始 AI 复盘' });
    await user.click(screen.getByRole('button', { name: '开始 AI 复盘' }));
    await user.click(await screen.findByRole('button', { name: '预览发送内容' }));
    view.unmount();
    pending.resolve(preview);

    await waitFor(() => expect(fake.reviews.review.cancelPreview)
      .toHaveBeenCalledWith(preview.token));
  });

  it('shows proposal context from the list DTO and never fetches it per card', async () => {
    window.location.hash = '#/reviews';
    const fake = resetJobSearchFake();
    fake.reviews.proposals.list.mockResolvedValue({
      items: [
      proposal,
      { ...proposal, id: '55555555-5555-4555-8555-555555555555', status: 'ignored', resolvedAt: '2026-07-27T11:00:00.000Z' },
      ],
      corruptItems: [],
      corruptCount: 0,
    });
    const user = userEvent.setup();
    render(<App />);

    const drawer = await screen.findByRole('dialog', { name: '待确认清单' });
    expect((await screen.findAllByText('远山科技 · AI 产品经理')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('业务一面 · 2026-07-27')).length).toBeGreaterThan(0);
    expect(fake.positions.get).not.toHaveBeenCalled();
    expect(fake.reviews.interviews.get).not.toHaveBeenCalled();

    await user.click(within(drawer).getByRole('button', { name: '历史 1' }));
    expect(within(drawer).getByText('已忽略')).toBeInTheDocument();
  });

  it('edits a question with fields and relation selectors, validates integers, resets cancel, and retains failure input', async () => {
    window.location.hash = '#/reviews';
    const fake = installJobSearchFake(resetJobSearchFake());
    const capabilityAsset = {
      id: '88888888-8888-4888-8888-888888888888',
      name: '问题拆解',
      jdFrequency: 3,
      evidence: '',
      gaps: '',
      mergedIntoId: null,
      createdAt: '2026-07-27T08:00:00.000Z',
      updatedAt: '2026-07-27T08:00:00.000Z',
    };
    fake.reviews.proposals.list.mockResolvedValue({
      items: [proposal],
      corruptItems: [],
      corruptCount: 0,
    });
    fake.assets.projects.list.mockResolvedValue([projectAsset]);
    fake.assets.capabilities.list.mockResolvedValue([capabilityAsset]);
    fake.reviews.proposals.accept.mockRejectedValue(new Error('write failed'));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '编辑后接受' }));
    expect(screen.getAllByText('高级 JSON 视图')).toHaveLength(2);
    expect(screen.getByLabelText(/问题类型/)).toHaveValue('interviewer');
    expect(screen.getByRole('checkbox', { name: projectAsset.name })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: capabilityAsset.name })).not.toBeChecked();

    await user.clear(screen.getByLabelText(/问题文本/));
    await user.type(screen.getByLabelText(/问题文本/), '用户确认后的问题');
    await user.click(screen.getByRole('checkbox', { name: projectAsset.name }));
    fireEvent.change(screen.getByLabelText(/出现次数/), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: '确认写入' }));
    expect(screen.getByText('请输入非负整数')).toBeInTheDocument();
    expect(fake.reviews.proposals.accept).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/出现次数/), { target: { value: '1.5' } });
    await user.click(screen.getByRole('button', { name: '确认写入' }));
    const countInput = screen.getByLabelText(/出现次数/);
    expect(countInput).toHaveAttribute('aria-invalid', 'true');
    expect(countInput.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('请输入非负整数')).toBeInTheDocument();
    expect(fake.reviews.proposals.accept).not.toHaveBeenCalled();

    fireEvent.change(countInput, { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: '取消' }));
    await user.click(screen.getByRole('button', { name: '编辑后接受' }));
    expect(screen.getByLabelText(/问题文本/)).toHaveValue(
      (proposal.payload as { text: string }).text,
    );

    await user.clear(screen.getByLabelText(/问题文本/));
    await user.type(screen.getByLabelText(/问题文本/), '用户确认后的问题');
    await user.click(screen.getByRole('button', { name: '确认写入' }));
    expect(await screen.findByText('写入失败，已保留你的修改。')).toBeInTheDocument();
    expect(screen.getByText('写入失败，请检查内容后重试。')).toBeInTheDocument();
    expect(screen.getByLabelText(/问题文本/)).toHaveValue('用户确认后的问题');
    expect(fake.assets.projects.list).toHaveBeenCalledTimes(1);
    expect(fake.assets.capabilities.list).toHaveBeenCalledTimes(1);
  });

  it('renders project, capability, and insight proposal editors as typed forms', async () => {
    window.location.hash = '#/reviews';
    const projectProposal: ChangeProposalListItem = {
      ...proposal,
      id: '66666666-6666-4666-8666-666666666666',
      targetType: 'project',
      payload: {
        name: '求职闭环',
        background: '信息分散',
        goal: '建立闭环',
        role: '产品经理',
        keyDecisions: '本地优先',
        outcome: '完成 MVP',
        evidence: '可运行版本',
        reflections: '保持紧凑',
        storytellingVersions: 'STAR 版本',
        unclassifiedNotes: '待整理片段',
      },
      rationale: '补充项目',
    };
    const capabilityProposal: ChangeProposalListItem = {
      ...proposal,
      id: '77777777-7777-4777-8777-777777777777',
      targetType: 'capability',
      targetId: '88888888-8888-4888-8888-888888888888',
      operation: 'merge',
      payload: {
        name: '问题拆解',
        jdFrequency: 4,
        evidence: '面试证据',
        gaps: '',
        mergedIntoId: null,
      },
      rationale: '合并能力',
    };
    const insightProposal: ChangeProposalListItem = {
      ...proposal,
      id: '99999999-9999-4999-8999-999999999999',
      targetType: 'insight',
      payload: {
        title: '表达顺序',
        content: '先给结论',
        positionId: null,
        projectId: null,
        questionId: null,
        capabilityId: null,
      },
      rationale: '沉淀心得',
    };
    const fake = resetJobSearchFake();
    fake.reviews.proposals.list.mockResolvedValue({
      items: [projectProposal, capabilityProposal, insightProposal],
      corruptItems: [],
      corruptCount: 0,
    });
    fake.assets.projects.list.mockResolvedValue([projectAsset]);
    fake.assets.questions.list.mockResolvedValue([{
      ...(proposal.payload as {
        type: 'interviewer';
        text: string;
        answerDraft: string;
        projectIds: string[];
        capabilityIds: string[];
        occurrenceCount: number;
        status: string;
      }),
      id: proposal.id,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    }]);
    fake.assets.capabilities.list.mockResolvedValue([{
      ...(capabilityProposal.payload as {
        name: string;
        jdFrequency: number;
        evidence: string;
        gaps: string;
        mergedIntoId: string | null;
      }),
      id: capabilityProposal.targetId!,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    }]);
    fake.positions.list.mockResolvedValue([{
      id: position.id,
      company: position.company,
      title: position.title,
      location: '',
      interest: 5,
      currentStage: 'interview',
      finalResult: null,
      updatedAt: position.updatedAt,
    }]);
    const user = userEvent.setup();
    render(<App />);

    const editButtons = await screen.findAllByRole('button', { name: '编辑后接受' });
    await user.click(editButtons[0]);
    expect(screen.getByLabelText(/项目名称/)).toHaveValue('求职闭环');
    expect(screen.getByLabelText('待整理内容')).toHaveValue('待整理片段');
    await user.clear(screen.getByLabelText(/项目名称/));
    await user.click(screen.getByRole('button', { name: '确认写入' }));
    expect(screen.getByLabelText(/项目名称/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/项目名称/).getAttribute('aria-describedby')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消' }));

    await user.click(editButtons[1]);
    expect(screen.getByLabelText(/能力名称/)).toHaveValue('问题拆解');
    expect(screen.getByText(`合并目标：${capabilityProposal.targetId}`)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/能力名称/));
    await user.click(screen.getByRole('button', { name: '确认写入' }));
    expect(screen.getByLabelText(/能力名称/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/能力名称/).getAttribute('aria-describedby')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消' }));

    await user.click(editButtons[2]);
    expect(screen.getByLabelText(/心得标题/)).toHaveValue('表达顺序');
    expect(screen.getByLabelText('关联岗位（可选）')).toBeInTheDocument();
    expect(screen.getByLabelText('关联项目（可选）')).toBeInTheDocument();
    expect(screen.getByLabelText('关联问题（可选）')).toBeInTheDocument();
    expect(screen.getByLabelText('关联能力（可选）')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/心得标题/));
    await user.click(screen.getByRole('button', { name: '确认写入' }));
    expect(screen.getByLabelText(/心得标题/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/心得标题/).getAttribute('aria-describedby')).toBeTruthy();
    expect(fake.positions.list).toHaveBeenCalledTimes(1);
    expect(fake.assets.projects.list).toHaveBeenCalledTimes(1);
    expect(fake.assets.questions.list).toHaveBeenCalledTimes(1);
    expect(fake.assets.capabilities.list).toHaveBeenCalledTimes(1);
  });

  it('shows merged historical capability references as read-only without dropping ids', async () => {
    window.location.hash = '#/reviews';
    const historicalCapabilityId = '88888888-8888-4888-8888-888888888888';
    const historicalProposal: ChangeProposalListItem = {
      ...proposal,
      payload: {
        ...(proposal.payload as Record<string, unknown>),
        capabilityIds: [historicalCapabilityId],
      },
    };
    const fake = resetJobSearchFake();
    fake.reviews.proposals.list.mockResolvedValue({
      items: [historicalProposal],
      corruptItems: [],
      corruptCount: 0,
    });
    fake.assets.capabilities.list.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '编辑后接受' }));
    const historical = screen.getByRole('checkbox', {
      name: `历史能力（已合并或不可用） ${historicalCapabilityId}`,
    });
    expect(historical).toBeChecked();
    expect(historical).toBeDisabled();
  });

  it('prevents duplicate mutations and keeps corrupt proposals read-only without raw JSON', async () => {
    window.location.hash = '#/reviews';
    const pendingAccept = deferred<ChangeProposal>();
    const fake = resetJobSearchFake();
    fake.reviews.proposals.list.mockResolvedValue({
      items: [proposal],
      corruptItems: [{
        id: 'corrupt-row',
        status: 'pending',
        createdAt: null,
        code: 'CORRUPT_PROPOSAL',
        message: '该建议的数据已损坏，只能只读查看。',
        readOnly: true,
        context: proposal.context,
      }],
      corruptCount: 1,
    });
    fake.reviews.proposals.accept.mockReturnValue(pendingAccept.promise);
    const user = userEvent.setup();
    render(<App />);

    const accept = await screen.findByRole('button', { name: '接受' });
    await user.dblClick(accept);
    expect(fake.reviews.proposals.accept).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('建议数据不可用')).toBeInTheDocument();
    const corruptCard = screen.getByText('建议数据不可用').closest('article');
    expect(corruptCard).not.toBeNull();
    expect(within(corruptCard!).queryByRole('button', { name: '接受' })).not.toBeInTheDocument();
    expect(within(corruptCard!).queryByRole('button', { name: '忽略' })).not.toBeInTheDocument();
    expect(within(corruptCard!).queryByText(/payload_json/i)).not.toBeInTheDocument();
    pendingAccept.resolve({ ...proposal, status: 'accepted' });
  });

  it('shows success toasts and keeps inline plus toast errors for proposal actions', async () => {
    window.location.hash = '#/reviews';
    const ignoredCandidate: ChangeProposalListItem = {
      ...proposal,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      rationale: '准备忽略的建议',
    };
    const fake = resetJobSearchFake();
    fake.reviews.proposals.list.mockResolvedValue({
      items: [proposal, ignoredCandidate],
      corruptItems: [],
      corruptCount: 0,
    });
    fake.reviews.proposals.accept.mockResolvedValue({
      ...proposal,
      status: 'accepted',
      resolvedAt: '2026-07-28T12:00:00.000Z',
    });
    fake.reviews.proposals.ignore.mockRejectedValue(new Error('disk full'));
    const user = userEvent.setup();
    render(<App />);

    const acceptButtons = await screen.findAllByRole('button', { name: '接受' });
    await user.click(acceptButtons[0]);
    expect(await screen.findByText('建议已接受并写入资产。')).toBeInTheDocument();

    const ignoreButton = screen.getByRole('button', { name: '忽略' });
    await user.click(ignoreButton);
    expect(await screen.findByRole('alert')).toHaveTextContent('忽略失败，请稍后重试。');
    expect(within(screen.getByRole('region', { name: '通知' }))
      .getByText('忽略失败，请稍后重试。')).toBeInTheDocument();
    expect(fake.reviews.proposals.ignore).toHaveBeenCalledWith(ignoredCandidate.id);
  });
});
