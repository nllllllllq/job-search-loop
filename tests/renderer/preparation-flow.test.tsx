import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import type {
  PositionDetail,
  PreparationMaterial,
  Project,
  Question,
} from '../../src/shared/domain';
import { installJobSearchFake, type JobSearchApiFake } from '../helpers/bridge';

const positionId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const questionId = '33333333-3333-4333-8333-333333333333';

const detail: PositionDetail = {
  id: positionId,
  company: '远山科技',
  title: 'AI 产品经理',
  interest: 5,
  rawJd: '需要用户研究与产品规划能力。\n需要跨团队协作。',
  currentStage: 'applied',
  finalResult: null,
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
  stages: [],
  interviews: [],
};

const project: Project = {
  id: projectId,
  name: '增长实验',
  background: '新用户不知道第一步做什么。',
  goal: '提升首周留存。',
  role: '产品负责人',
  keyDecisions: '先验证引导路径。',
  outcome: '首周留存提升 8%。',
  evidence: '实验数据与访谈记录。',
  reflections: '应更早建立对照组。',
  storytellingVersions: '两分钟业务面版本。',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const question: Question = {
  id: questionId,
  type: 'interviewer',
  text: '如何设计用户研究？',
  answerDraft: '先明确决策问题。',
  projectIds: [projectId],
  capabilityIds: [],
  occurrenceCount: 2,
  status: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const preparation: PreparationMaterial = {
  id: '55555555-5555-4555-8555-555555555555',
  positionId,
  rawJdSnapshot: detail.rawJd,
  promptSnapshot: '岗位准备 prompt',
  assetsSnapshot: JSON.stringify({ projects: [project], questions: [question] }),
  modelSnapshot: 'model-a',
  outputSnapshot: JSON.stringify({
    roleSummary: '负责把复杂需求整理为产品方案。',
    capabilityFocus: [{ name: '用户研究', reason: 'JD 明确要求。' }],
    projectTalkingPoints: [{ projectId, points: ['说明背景', '提供证据'] }],
    likelyQuestions: [{ question: '如何验证需求？', answerOutline: '先验证高风险假设。' }],
    candidateQuestions: ['团队如何定义产品成功？'],
    riskNotes: ['跨团队案例需要补充。'],
    competencyMap: [
      { rank: 1, name: '用户洞察', evidence: '职责首段与要求段均出现。' },
      { rank: 2, name: '产品规划', evidence: '核心职责明确强调。' },
      { rank: 3, name: 'AI 理解', evidence: '岗位标题与技能要求均强调。' },
      { rank: 4, name: '数据分析', evidence: '结果衡量要求中出现。' },
      { rank: 5, name: '跨团队协作', evidence: '协作要求中出现。' },
    ],
    companyMap: {
      stage: 'Realignment',
      summary: '公司正重新校准 AI 产品方向。',
      priorities: ['验证高价值场景'],
      culture: ['快速实验'],
    },
    dreamCandidateAvatar: {
      typicalDay: [
        { time: '09:00', activity: '分析用户反馈', purpose: '识别高风险假设' },
        { time: '14:00', activity: '跨团队评审', purpose: '形成决策' },
      ],
      superpower: '把模糊需求转成可验证实验。',
      successStory: '推动关键指标改善。',
      quote: '先验证最昂贵的假设。',
      painProfile: '缺少完整从零到一案例。',
    },
    actionGuide: {
      selfIntroTagline: '我擅长把复杂 AI 场景变成可验证的产品决策。',
      cultureFitPhrase: '用小步实验建立跨团队共识。',
      questions: ['问题一？', '问题二？', '问题三？'],
    },
  }),
  generatedAt: '2026-07-27T09:30:00.000Z',
  createdAt: '2026-07-27T09:30:00.000Z',
};

const outboundPreview = {
  prompt: '岗位准备 prompt',
  position: {
    company: detail.company,
    title: detail.title,
    rawJd: detail.rawJd,
  },
  selectedAssets: {
    projects: [project],
    questions: [question],
  },
  jobDataJson: JSON.stringify({
    position: {
      company: detail.company,
      title: detail.title,
      rawJd: detail.rawJd,
    },
    selectedAssets: {
      projects: [project],
      questions: [question],
    },
  }, null, 2),
};

function renderPreparation(
  configure?: (fake: JobSearchApiFake) => void,
) {
  window.location.hash = `#/positions/${positionId}`;
  const fake = installJobSearchFake();
  fake.positions.get.mockResolvedValue(detail);
  fake.preparations.list.mockResolvedValue([]);
  fake.preparations.preview.mockResolvedValue(outboundPreview);
  fake.assets.projects.list.mockResolvedValue([project]);
  fake.assets.questions.list.mockResolvedValue([question]);
  fake.ai.settings.get.mockResolvedValue({
    baseUrl: 'https://api.example.com/v1',
    model: 'model-a',
    hasApiKey: true,
  });
  fake.assets.prompts.get.mockResolvedValue({
    id: '77777777-7777-4777-8777-777777777777',
    kind: 'preparation',
    name: '岗位准备',
    content: '岗位准备 prompt',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  });
  configure?.(fake);
  return { fake, user: userEvent.setup(), ...render(<App />) };
}

async function openPreparationTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: '准备材料' }));
}

describe('preparation flow', () => {
  it('does not generate automatically, allows cancel, and selects no assets by default', async () => {
    const { fake, user } = renderPreparation();
    expect(fake.preparations.list).not.toHaveBeenCalled();
    await openPreparationTab(user);
    expect(fake.preparations.generate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '生成准备材料' }));
    const dialog = screen.getByRole('dialog', { name: '生成准备材料' });
    expect(within(dialog).getByRole('checkbox', { name: /项目：增长实验/ }))
      .not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /问题：如何设计用户研究/ }))
      .not.toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(fake.preparations.generate).not.toHaveBeenCalled();
  });

  it('shows a payload summary before explicit confirmation and calls generate once', async () => {
    const { fake, user } = renderPreparation((api) => {
      api.preparations.generate.mockResolvedValue(preparation);
      api.preparations.list
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([preparation]);
    });
    await openPreparationTab(user);
    await user.click(screen.getByRole('button', { name: '生成准备材料' }));
    const dialog = screen.getByRole('dialog', { name: '生成准备材料' });
    await user.click(within(dialog).getByRole('checkbox', { name: /项目：增长实验/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /问题：如何设计用户研究/ }));
    await user.click(within(dialog).getByRole('button', { name: '查看发送摘要' }));

    await waitFor(() => expect(fake.preparations.preview).toHaveBeenCalledWith({
      positionId,
      projectIds: [projectId],
      questionIds: [questionId],
    }));
    expect(fake.assets.prompts.get).not.toHaveBeenCalled();
    expect(fake.preparations.generate).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/公司与岗位名称的完整内容/)).toBeInTheDocument();
    expect(within(dialog).getByText(
      new RegExp(`原始 JD：完整原文（${detail.rawJd.length} 个字符）`),
    ))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/当前「岗位准备」Prompt 模板完整内容/))
      .toHaveTextContent(`${'岗位准备 prompt'.length} 个字符`);
    expect(within(dialog).getByText(/1 个所选项目档案的完整字段内容/))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/1 个所选问题条目的完整字段内容/))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/https:\/\/api\.example\.com/)).toBeInTheDocument();
    expect(within(dialog).getByText(/model-a/)).toBeInTheDocument();
    expect(within(dialog).getByText(/生成时主进程会再次读取最新外部 AI 配置/))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/预览后数据发生变化/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/secret|API Key/i)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('region', {
      name: '实际外发内容预览',
    }).querySelectorAll('details[open]')).toHaveLength(0);

    await user.click(within(dialog).getByText('完整公司与岗位'));
    expect(within(dialog).getByText(detail.company)).toBeInTheDocument();
    expect(within(dialog).getByText(detail.title)).toBeInTheDocument();
    await user.click(within(dialog).getByText('完整原始 JD'));
    expect(within(dialog).getByText((_content, element) => (
      element?.tagName === 'PRE' && element.textContent === detail.rawJd
    ))).toBeInTheDocument();
    await user.click(within(dialog).getByText('当前岗位准备 Prompt 原文'));
    expect(within(dialog).getByText('岗位准备 prompt')).toBeInTheDocument();
    const projectSummary = within(dialog).getByText('项目档案 1：增长实验');
    await user.click(projectSummary);
    expect(within(projectSummary.closest('details')!).getByText(
      /"background": "新用户不知道第一步做什么。"/,
    ))
      .toBeInTheDocument();
    const questionSummary = within(dialog).getByText('问题档案 1：如何设计用户研究？');
    await user.click(questionSummary);
    expect(within(questionSummary.closest('details')!).getByText(
      /"answerDraft": "先明确决策问题。"/,
    ))
      .toBeInTheDocument();
    await user.click(within(dialog).getByText('实际请求中的岗位数据 JSON'));
    expect(within(dialog).getByText((_content, element) => (
      element?.tagName === 'PRE' && element.textContent === outboundPreview.jobDataJson
    ))).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '确认生成' }));
    await waitFor(() => expect(fake.preparations.generate).toHaveBeenCalledOnce());
    expect(fake.preparations.generate).toHaveBeenCalledWith({
      positionId,
      projectIds: [projectId],
      questionIds: [questionId],
    });
    expect(await screen.findByRole('heading', { name: '负责把复杂需求整理为产品方案。' }))
      .toBeInTheDocument();
  });

  it('blocks confirmation and links to settings when public AI configuration is incomplete', async () => {
    const { fake, user } = renderPreparation((api) => {
      api.ai.settings.get.mockResolvedValue({
        baseUrl: 'https://api.example.com/v1',
        model: 'model-a',
        hasApiKey: false,
      });
    });
    await openPreparationTab(user);
    await user.click(screen.getByRole('button', { name: '生成准备材料' }));
    const dialog = screen.getByRole('dialog', { name: '生成准备材料' });

    expect(within(dialog).getByText(/外部 AI 配置尚未完成/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '查看发送摘要' })).toBeDisabled();
    expect(within(dialog).getByRole('link', { name: '前往设置' }))
      .toHaveAttribute('href', '#/settings');
    expect(fake.preparations.generate).not.toHaveBeenCalled();
  });

  it('retains explicit selections after failure and retries without duplicate submission', async () => {
    let rejectRequest!: (reason: unknown) => void;
    const pending = new Promise<PreparationMaterial>((_resolve, reject) => {
      rejectRequest = reject;
    });
    const { fake, user } = renderPreparation((api) => {
      api.preparations.generate
        .mockReturnValueOnce(pending)
        .mockResolvedValueOnce(preparation);
      api.preparations.list
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([preparation]);
    });
    await openPreparationTab(user);
    await user.click(screen.getByRole('button', { name: '生成准备材料' }));
    const dialog = screen.getByRole('dialog', { name: '生成准备材料' });
    await user.click(within(dialog).getByRole('checkbox', { name: /项目：增长实验/ }));
    await user.click(within(dialog).getByRole('button', { name: '查看发送摘要' }));
    const confirm = within(dialog).getByRole('button', { name: '确认生成' });
    await user.click(confirm);
    await user.click(confirm);
    expect(fake.preparations.generate).toHaveBeenCalledOnce();
    rejectRequest({ code: 'AI_TIMEOUT', message: 'provider secret' });

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('请求超时');
    await user.click(within(dialog).getByRole('button', { name: '返回选择' }));
    expect(within(dialog).getByRole('checkbox', { name: /项目：增长实验/ })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: '查看发送摘要' }));
    await user.click(within(dialog).getByRole('button', { name: '确认生成' }));
    await waitFor(() => expect(fake.preparations.generate).toHaveBeenCalledTimes(2));
  });

  it('renders newest history, all six output sections and safe snapshot text', async () => {
    const older = {
      ...preparation,
      id: '66666666-6666-4666-8666-666666666666',
      generatedAt: '2026-07-26T09:30:00.000Z',
      outputSnapshot: JSON.stringify({
        ...JSON.parse(preparation.outputSnapshot),
        roleSummary: '<img src=x onerror=alert(1)>旧版本',
      }),
    };
    const { user } = renderPreparation((api) => {
      api.preparations.list.mockResolvedValue([preparation, older]);
    });
    await openPreparationTab(user);

    const articles = await screen.findAllByRole('article', { name: /准备版本/ });
    expect(articles[0].querySelector('time')).toHaveAttribute(
      'dateTime',
      '2026-07-27T09:30:00.000Z',
    );
    expect(articles[1].querySelector('time')).toHaveAttribute(
      'dateTime',
      '2026-07-26T09:30:00.000Z',
    );
    expect(screen.getAllByText('岗位摘要')).toHaveLength(2);
    expect(screen.getAllByText('能力重点')).toHaveLength(2);
    expect(screen.getAllByText('项目讲述要点')).toHaveLength(2);
    expect(screen.getAllByText('可能问题')).toHaveLength(2);
    expect(screen.getAllByText('候选人反问')).toHaveLength(2);
    expect(screen.getAllByText('风险提示')).toHaveLength(2);
    expect(screen.getAllByText('输入快照')).toHaveLength(2);
    expect(screen.getByText('<img src=x onerror=alert(1)>旧版本')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders the four new framework groups with an accessible Top 5 table and action guide', async () => {
    const { user } = renderPreparation((api) => {
      api.preparations.list.mockResolvedValue([preparation]);
    });
    await openPreparationTab(user);

    expect(await screen.findByRole('heading', { name: 'Map Competencies' }))
      .toBeInTheDocument();
    const table = screen.getByRole('table', { name: '岗位核心能力 Top 5' });
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(within(table).getByText('用户洞察')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Company Map' })).toBeInTheDocument();
    expect(screen.getByText(/Realignment · 重新校准/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dream Candidate Avatar' }))
      .toBeInTheDocument();
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Action Guide' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '定制收尾问题' }).children).toHaveLength(3);
  });

  it('keeps old six-field snapshots readable and labels them as legacy', async () => {
    const parsed = JSON.parse(preparation.outputSnapshot);
    delete parsed.competencyMap;
    delete parsed.companyMap;
    delete parsed.dreamCandidateAvatar;
    delete parsed.actionGuide;
    const legacy = {
      ...preparation,
      id: '99999999-9999-4999-8999-999999999999',
      outputSnapshot: JSON.stringify(parsed),
    };
    const { user } = renderPreparation((api) => {
      api.preparations.list.mockResolvedValue([legacy]);
    });
    await openPreparationTab(user);

    expect(await screen.findByRole('heading', {
      name: '负责把复杂需求整理为产品方案。',
    })).toBeInTheDocument();
    expect(screen.getByText(/旧版结构/)).toBeInTheDocument();
    expect(screen.getByText('能力重点')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('isolates an unreadable snapshot while keeping valid history visible', async () => {
    const corrupt: PreparationMaterial = {
      ...preparation,
      id: '88888888-8888-4888-8888-888888888888',
      generatedAt: 'not-a-date',
      outputSnapshot: 'not-json',
    };
    const { user } = renderPreparation((api) => {
      api.preparations.list.mockResolvedValue([corrupt, preparation]);
    });
    await openPreparationTab(user);

    expect(await screen.findByRole('heading', {
      name: '负责把复杂需求整理为产品方案。',
    })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('这个历史版本的数据无法安全读取');
    expect(screen.getByText('时间无效')).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: /准备版本/ })).toHaveLength(2);
  });

  it('shows independent loading, error with retry, and useful empty states', async () => {
    const never = new Promise<PreparationMaterial[]>(() => undefined);
    const loading = renderPreparation((api) => {
      api.preparations.list.mockReturnValue(never);
    });
    await openPreparationTab(loading.user);
    expect(screen.getByRole('status')).toHaveTextContent('正在读取准备材料');
    loading.unmount();

    const failed = renderPreparation((api) => {
      api.preparations.list
        .mockRejectedValueOnce(new Error('SQL secret'))
        .mockResolvedValueOnce([]);
    });
    await openPreparationTab(failed.user);
    expect(await screen.findByRole('heading', { name: '准备材料载入失败' }))
      .toBeInTheDocument();
    expect(screen.queryByText('SQL secret')).not.toBeInTheDocument();
    await failed.user.click(screen.getByRole('button', { name: '重试准备材料' }));
    expect(await screen.findByRole('heading', { name: '还没有准备材料' }))
      .toBeInTheDocument();
  });
});
