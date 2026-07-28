import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/App';
import type {
  ChangeProposal,
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

const proposal: ChangeProposal = {
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

    await user.click(await screen.findByRole('tab', { name: '面试记录' }));
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
    await user.click(screen.getByRole('button', { name: '取消' }));
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

    await user.click(await screen.findByRole('tab', { name: '面试记录' }));
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

    await user.click(await screen.findByRole('tab', { name: '面试记录' }));
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

    await user.click(await screen.findByRole('tab', { name: '面试记录' }));
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

    await user.click(await screen.findByRole('tab', { name: '面试记录' }));
    await user.click(screen.getByRole('button', { name: '开始 AI 复盘' }));
    await user.click(await screen.findByRole('button', { name: '预览发送内容' }));
    view.unmount();
    pending.resolve(preview);

    await waitFor(() => expect(fake.reviews.review.cancelPreview)
      .toHaveBeenCalledWith(preview.token));
  });

  it('shows proposal context/history and supports accept, edit-accept validation, and ignore', async () => {
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
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.interviews.get.mockResolvedValue(interview);
    fake.reviews.proposals.accept.mockResolvedValue({ ...proposal, status: 'accepted' });
    fake.reviews.proposals.ignore.mockResolvedValue({ ...proposal, status: 'ignored' });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: '待确认变更' })).toBeInTheDocument();
    expect((await screen.findAllByText('远山科技 · AI 产品经理')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('业务一面')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '接受' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑后接受' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '忽略' })).toBeInTheDocument();
    expect(screen.getByText('已忽略')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '编辑后接受' }));
    const dialog = screen.getByRole('dialog');
    const editor = within(dialog).getByLabelText('建议内容 JSON');
    fireEvent.change(editor, { target: { value: '{"type":"interviewer","text":""}' } });
    expect(within(dialog).getByRole('button', { name: '确认写入' })).toBeDisabled();
    fireEvent.change(editor, {
      target: {
        value: JSON.stringify({ ...proposal.payload as object, unexpected: true }),
      },
    });
    expect(within(dialog).getByRole('button', { name: '确认写入' })).toBeDisabled();
    fireEvent.change(editor, { target: { value: JSON.stringify(proposal.payload) } });
    await user.click(within(dialog).getByRole('button', { name: '确认写入' }));
    await waitFor(() => expect(fake.reviews.proposals.accept)
      .toHaveBeenCalledWith(proposal.id, proposal.payload));
    expect(await screen.findByText('修改后的建议已接受并写入资产。')).toBeInTheDocument();
  });

  it('retains proposal editor content after mutation failure', async () => {
    window.location.hash = '#/reviews';
    const fake = installJobSearchFake(resetJobSearchFake());
    fake.reviews.proposals.list.mockResolvedValue({
      items: [proposal],
      corruptItems: [],
      corruptCount: 0,
    });
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.interviews.get.mockResolvedValue(interview);
    fake.reviews.proposals.accept.mockRejectedValue(new Error('write failed'));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '编辑后接受' }));
    const editor = screen.getByLabelText('建议内容 JSON');
    const edited = { ...proposal.payload as Record<string, unknown>, text: '用户确认后的问题' };
    fireEvent.change(editor, { target: { value: JSON.stringify(edited) } });
    await user.click(screen.getByRole('button', { name: '确认写入' }));
    expect(await screen.findByText('写入失败，已保留你的修改。')).toBeInTheDocument();
    expect(screen.getByText('写入失败，请检查内容后重试。')).toBeInTheDocument();
    expect(screen.getByLabelText('建议内容 JSON')).toHaveValue(JSON.stringify(edited));
  });

  it('wires direct accept and ignore as separate pending actions', async () => {
    window.location.hash = '#/reviews';
    const second = {
      ...proposal,
      id: '66666666-6666-4666-8666-666666666666',
      rationale: '不采用的建议',
    };
    const fake = resetJobSearchFake();
    fake.reviews.proposals.list.mockResolvedValue({
      items: [proposal, second],
      corruptItems: [],
      corruptCount: 0,
    });
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.interviews.get.mockResolvedValue(interview);
    fake.reviews.proposals.accept.mockImplementation(async (id) => ({
      ...(id === proposal.id ? proposal : second),
      status: 'accepted',
      resolvedAt: '2026-07-27T12:00:00.000Z',
    }));
    fake.reviews.proposals.ignore.mockImplementation(async (id) => ({
      ...(id === proposal.id ? proposal : second),
      status: 'ignored',
      resolvedAt: '2026-07-27T12:00:00.000Z',
    }));
    const user = userEvent.setup();
    render(<App />);

    const acceptButtons = await screen.findAllByRole('button', { name: '接受' });
    await user.click(acceptButtons[0]);
    await waitFor(() => expect(fake.reviews.proposals.accept)
      .toHaveBeenCalledWith(proposal.id));
    expect(await screen.findByText('建议已接受并写入资产。')).toBeInTheDocument();
    const ignoreButtons = screen.getAllByRole('button', { name: '忽略' });
    await user.click(ignoreButtons[0]);
    await waitFor(() => expect(fake.reviews.proposals.ignore)
      .toHaveBeenCalledWith(second.id));
    expect(await screen.findByText('建议已忽略，资产没有变化。')).toBeInTheDocument();
  });
});
