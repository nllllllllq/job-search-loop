import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/App';
import type {
  Interview,
  InterviewReviewPreview,
  Insight,
  PositionDetail,
  ProcessStage,
  Project,
} from '../../src/shared/domain';
import { resetJobSearchFake } from '../helpers/bridge';

const positionId = '11111111-1111-4111-8111-111111111111';
const interviewId = '22222222-2222-4222-8222-222222222222';
const interviewStageId = '33333333-3333-4333-8333-333333333333';

const interviewStage: ProcessStage = {
  id: interviewStageId,
  positionId,
  name: '面试',
  canonicalStage: 'interview',
  actualDate: null,
  expectedDate: '2026-07-28',
  feedback: '',
  notes: '',
  orderIndex: 0,
  createdAt: '2026-07-27T08:00:00.000Z',
  updatedAt: '2026-07-27T08:00:00.000Z',
};

const interview: Interview = {
  id: interviewId,
  positionId,
  stageId: interviewStageId,
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
  stages: [interviewStage],
  interviews: [interview],
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

const insightAsset: Insight = {
  id: '88888888-8888-4888-8888-888888888888',
  title: '先给结论',
  content: '先说判断，再给证据。',
  positionId,
  projectId: null,
  questionId: null,
  capabilityId: null,
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

async function renderWithInterviewStage(user: ReturnType<typeof userEvent.setup>) {
  const view = render(<App />);
  await user.click(await screen.findByRole('button', { name: /编辑流程阶段：面试/ }));
  return view;
}

describe('interview and review UI', () => {
  beforeEach(() => {
    window.location.hash = `#/positions/${positionId}`;
    resetJobSearchFake();
  });

  it('creates and edits manual interview text, validates dates, retains failed values, and sorts newest first', async () => {
    const fake = resetJobSearchFake();
    fake.positions.get.mockResolvedValue({
      ...position,
      interviews: [
        interview,
        { ...interview, id: '44444444-4444-4444-8444-444444444444', roundName: '终面', interviewDate: '2026-07-28' },
      ],
    });
    fake.reviews.interviews.create.mockRejectedValueOnce(new Error('disk full'));
    fake.reviews.interviews.update.mockResolvedValue({
      ...interview,
      personalNotes: '编辑后的个人补充',
    });
    const user = userEvent.setup();
    await renderWithInterviewStage(user);

    await screen.findByRole('heading', { level: 4, name: '终面' });
    expect(screen.getAllByRole('heading', { level: 4 }).map((item) => item.textContent))
      .toEqual(['节点面试记录', '终面', '业务一面']);
    expect(screen.getByRole('heading', { level: 4, name: '节点面试记录' }))
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
    await user.click(within(screen.getByRole('dialog', { name: '新增面试记录' }))
      .getByRole('button', { name: '关闭对话框' }));
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
    fake.reviews.review.preview.mockResolvedValue(detailedPreview);
    fake.reviews.review.confirm.mockResolvedValue({
      interview: { ...interview, summary: '复盘完成' },
      proposals: [],
    });
    const user = userEvent.setup();
    await renderWithInterviewStage(user);

    await screen.findByRole('button', { name: '开始 AI 复盘' });
    expect(fake.reviews.review.preview).not.toHaveBeenCalled();
    expect(fake.reviews.review.confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '开始 AI 复盘' }));
    expect(await screen.findByRole('heading', { name: '选择复盘参考资产' })).toBeInTheDocument();
    expect(screen.getByText('未选择资产时，AI 仍可生成本次复盘和可复用内容。')).toBeInTheDocument();
    expect(screen.queryByText(/AI 只能提出新建建议/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '预览发送内容' }));
    expect(await screen.findByRole('heading', { name: '确认发送复盘数据' })).toBeInTheDocument();
    expect(screen.getByText('复盘结果保存在当前面试记录；纳入其他模块需后续主动操作。')).toBeInTheDocument();
    expect(screen.queryByText(/AI 只会生成摘要和待确认变更/)).not.toBeInTheDocument();
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
    await user.click(within(screen.getByRole('dialog', { name: '确认发送复盘数据' }))
      .getByRole('button', { name: '取消' }));
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

  it('renders the five review modules in the interview card and keeps reusable actions local', async () => {
    const fake = resetJobSearchFake();
    const reviewedInterview: Interview = {
      ...interview,
      reviewSnapshot: {
        status: 'valid',
        snapshot: {
          promptSnapshot: '请基于事实复盘面试。',
          modelSnapshot: 'model-review',
          inputSnapshot: '{}',
          output: {
            overview: {
              round: '业务一面',
              overall: '表达清楚。',
              keyFacts: ['讨论了需求优先级。'],
            },
            questionAnswers: [{
              question: '如何判断需求优先级？',
              answerSummary: '从目标和结果回答。',
              quality: '良好',
              improvement: '补充数据。',
            }],
            strengthsAndRisks: { strengths: ['拆解清晰'], risks: ['证据不足'] },
            nextRoundPreparation: ['准备量化案例。'],
            reusableItems: [{
              targetType: 'insight',
              title: '先给结论',
              content: '先说判断，再给证据。',
            }],
          },
          reviewedAt: '2026-07-27T10:00:00.000Z',
        },
      },
    };
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.review.preview.mockResolvedValue(preview);
    fake.reviews.review.confirm.mockResolvedValue({ interview: reviewedInterview, proposals: [] });
    const user = userEvent.setup();
    await renderWithInterviewStage(user);

    await user.click(await screen.findByRole('button', { name: '开始 AI 复盘' }));
    await user.click(await screen.findByRole('button', { name: '预览发送内容' }));
    await user.click(await screen.findByRole('button', { name: '确认并开始复盘' }));

    expect(await screen.findByRole('heading', { name: '本轮概览' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '问题与回答' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '优势与风险' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '下一轮准备' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '可复用内容' })).toBeInTheDocument();
    expect(screen.getByText('先给结论')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '纳入心得' })).toBeInTheDocument();
    expect(fake.reviews.proposals.list).not.toHaveBeenCalled();
  });

  it('B3 routes project and insight items through confirmation editors and returns to the review', async () => {
    const fake = resetJobSearchFake();
    const reviewedInterview: Interview = {
      ...interview,
      reviewSnapshot: {
        status: 'valid',
        snapshot: {
          promptSnapshot: '请基于事实复盘面试。',
          modelSnapshot: 'model-review',
          inputSnapshot: '{}',
          output: {
            overview: {
              round: '业务一面',
              overall: '表达清楚。',
              keyFacts: ['讨论了需求优先级。'],
            },
            questionAnswers: [],
            strengthsAndRisks: { strengths: [], risks: [] },
            nextRoundPreparation: [],
            reusableItems: [
              { targetType: 'project', title: '支付流程改造', content: '验证关键路径。' },
              { targetType: 'insight', title: '先给结论', content: '先说判断，再给证据。' },
            ],
          },
          reviewedAt: '2026-07-27T10:00:00.000Z',
        },
      },
    };
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.review.preview.mockResolvedValue(preview);
    fake.reviews.review.confirm.mockResolvedValue({ interview: reviewedInterview, proposals: [] });
    fake.assets.projects.save.mockResolvedValue(projectAsset);
    fake.assets.insights.save.mockResolvedValue(insightAsset);
    const user = userEvent.setup();
    await renderWithInterviewStage(user);

    await user.click(await screen.findByRole('button', { name: '开始 AI 复盘' }));
    await user.click(await screen.findByRole('button', { name: '预览发送内容' }));
    await user.click(screen.getByRole('button', { name: '确认并开始复盘' }));
    expect(await screen.findByRole('heading', { name: '可复用内容' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '纳入项目' }));
    const projectDialog = await screen.findByRole('dialog', { name: '纳入项目档案' });
    expect(within(projectDialog).getByLabelText(/项目名称/)).toHaveValue('支付流程改造');
    expect(within(projectDialog).getByLabelText(/项目内容/)).toHaveValue('验证关键路径。');
    await user.click(within(projectDialog).getByRole('button', { name: '确认纳入项目档案' }));
    await waitFor(() => expect(fake.assets.projects.save).toHaveBeenCalledWith({
      name: '支付流程改造',
      projectTime: '',
      background: '',
      goal: '',
      role: '',
      keyDecisions: '',
      outcome: '',
      evidence: '',
      reflections: '',
      storytellingVersions: '',
      unclassifiedNotes: '验证关键路径。',
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '纳入项目档案' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: '可复用内容' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '纳入心得' }));
    const insightDialog = await screen.findByRole('dialog', { name: '纳入心得' });
    expect(within(insightDialog).getByLabelText(/标题/)).toHaveValue('先给结论');
    expect(within(insightDialog).getByLabelText(/自由文本/)).toHaveValue('先说判断，再给证据。');
    await user.click(within(insightDialog).getByRole('button', { name: '确认纳入心得' }));
    await waitFor(() => expect(fake.assets.insights.save).toHaveBeenCalledWith({
      title: '先给结论',
      content: '先说判断，再给证据。',
      positionId,
      projectId: null,
      questionId: null,
      capabilityId: null,
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '纳入心得' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: '可复用内容' })).toBeInTheDocument();
    expect(screen.getByText('先说判断，再给证据。')).toBeInTheDocument();
  });

  it('B3 opens all reusable target editors and cancel never saves', async () => {
    const fake = resetJobSearchFake();
    const reviewedInterview: Interview = {
      ...interview,
      reviewSnapshot: {
        status: 'valid',
        snapshot: {
          promptSnapshot: '请基于事实复盘面试。',
          modelSnapshot: 'model-review',
          inputSnapshot: '{}',
          output: {
            overview: { round: '业务一面', overall: '表达清楚。', keyFacts: [] },
            questionAnswers: [],
            strengthsAndRisks: { strengths: [], risks: [] },
            nextRoundPreparation: [],
            reusableItems: [
              { targetType: 'project', title: '项目条目', content: '项目内容。' },
              { targetType: 'question', title: '问题条目', content: '问题内容。' },
              { targetType: 'capability', title: '能力条目', content: '能力内容。' },
              { targetType: 'insight', title: '心得条目', content: '心得内容。' },
            ],
          },
          reviewedAt: '2026-07-27T10:00:00.000Z',
        },
      },
    };
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.review.preview.mockResolvedValue(preview);
    fake.reviews.review.confirm.mockResolvedValue({ interview: reviewedInterview, proposals: [] });
    const user = userEvent.setup();
    await renderWithInterviewStage(user);

    await user.click(await screen.findByRole('button', { name: '开始 AI 复盘' }));
    await user.click(await screen.findByRole('button', { name: '预览发送内容' }));
    await user.click(screen.getByRole('button', { name: '确认并开始复盘' }));
    await screen.findByRole('heading', { name: '可复用内容' });

    await user.click(screen.getByRole('button', { name: '纳入项目' }));
    const projectDialog = await screen.findByRole('dialog', { name: '纳入项目档案' });
    expect(projectDialog).toBeInTheDocument();
    await user.click(within(projectDialog).getByRole('button', { name: '关闭对话框' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '纳入项目档案' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '纳入问题' }));
    const questionDialog = await screen.findByRole('dialog', { name: '纳入问题库' });
    expect(questionDialog).toBeInTheDocument();
    await user.click(within(questionDialog).getByRole('button', { name: '关闭对话框' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '纳入问题库' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '纳入能力' }));
    const capabilityDialog = await screen.findByRole('dialog', { name: '纳入能力' });
    expect(capabilityDialog).toBeInTheDocument();
    await user.click(within(capabilityDialog).getByRole('button', { name: '关闭对话框' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '纳入能力' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '纳入心得' }));
    const insightDialog = await screen.findByRole('dialog', { name: '纳入心得' });
    expect(insightDialog).toBeInTheDocument();
    await user.click(within(insightDialog).getByRole('button', { name: '关闭对话框' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '纳入心得' })).not.toBeInTheDocument());

    expect(fake.assets.projects.save).not.toHaveBeenCalled();
    expect(fake.assets.questions.save).not.toHaveBeenCalled();
    expect(fake.assets.capabilities.save).not.toHaveBeenCalled();
    expect(fake.assets.insights.save).not.toHaveBeenCalled();
  });

  it('defaults asset selection to none, binds selected ids, shows full outbound detail, and cancels the token', async () => {
    const fake = resetJobSearchFake();
    fake.positions.get.mockResolvedValue(position);
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
    await renderWithInterviewStage(user);

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

    await user.click(within(screen.getByRole('dialog', { name: '确认发送复盘数据' }))
      .getByRole('button', { name: '取消' }));
    await waitFor(() => expect(fake.reviews.review.cancelPreview)
      .toHaveBeenCalledWith(preview.token));
  });

  it.each([
    ['取消按钮', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(within(screen.getByRole('dialog', { name: '选择复盘参考资产' }))
        .getByRole('button', { name: '取消' }));
    }],
    ['关闭按钮', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(within(screen.getByRole('dialog', { name: '选择复盘参考资产' }))
        .getByRole('button', { name: '关闭对话框' }));
    }],
  ])('discards and cancels a late preview after %s', async (_label, close) => {
    const fake = resetJobSearchFake();
    const pending = deferred<InterviewReviewPreview>();
    fake.positions.get.mockResolvedValue(position);
    fake.reviews.review.preview.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    await renderWithInterviewStage(user);

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
    fake.reviews.review.preview.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const view = await renderWithInterviewStage(user);

    await screen.findByRole('button', { name: '开始 AI 复盘' });
    await user.click(screen.getByRole('button', { name: '开始 AI 复盘' }));
    await user.click(await screen.findByRole('button', { name: '预览发送内容' }));
    view.unmount();
    pending.resolve(preview);

    await waitFor(() => expect(fake.reviews.review.cancelPreview)
      .toHaveBeenCalledWith(preview.token));
  });

});
