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
  preparations: [],
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
  }),
  generatedAt: '2026-07-27T09:30:00.000Z',
  createdAt: '2026-07-27T09:30:00.000Z',
};

function renderPreparation(
  configure?: (fake: JobSearchApiFake) => void,
) {
  window.location.hash = `#/positions/${positionId}`;
  const fake = installJobSearchFake();
  fake.positions.get.mockResolvedValue(detail);
  fake.preparations.list.mockResolvedValue([]);
  fake.assets.projects.list.mockResolvedValue([project]);
  fake.assets.questions.list.mockResolvedValue([question]);
  configure?.(fake);
  return { fake, user: userEvent.setup(), ...render(<App />) };
}

async function openPreparationTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: '准备材料' }));
}

describe('preparation flow', () => {
  it('does not generate automatically, allows cancel, and selects no assets by default', async () => {
    const { fake, user } = renderPreparation();
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

    expect(fake.preparations.generate).not.toHaveBeenCalled();
    expect(within(dialog).getByText(`${detail.rawJd.length} 个字符`)).toBeInTheDocument();
    expect(within(dialog).getByText('1 个项目')).toBeInTheDocument();
    expect(within(dialog).getByText('1 个问题')).toBeInTheDocument();
    expect(within(dialog).getByText(/将发送到已配置的外部 AI/)).toBeInTheDocument();

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
    expect(articles[0]).toHaveTextContent('2026-07-27');
    expect(articles[1]).toHaveTextContent('2026-07-26');
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
