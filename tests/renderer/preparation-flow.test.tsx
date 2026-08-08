import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import type { PositionDetail, PreparationMaterial } from '../../src/shared/domain';
import { installJobSearchFake, type JobSearchApiFake } from '../helpers/bridge';

const positionId = '11111111-1111-4111-8111-111111111111';
const detail: PositionDetail = {
  id: positionId,
  company: '远山科技',
  title: 'AI 产品经理',
  location: '上海',
  interest: 5,
  rawJd: '负责企业 AI 产品规划与用户研究。',
  currentStage: 'applied',
  finalResult: null,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  stages: [],
  interviews: [],
};

const output = {
  companyAndProductResearch: {
    businessAndUsers: '面向企业用户提供 AI 产品。',
    coreProducts: ['企业智能助手'],
    businessModel: '企业订阅，具体定价待核实。',
    recentDirection: '正在加强智能体能力。',
    roleProductHypothesis: '岗位可能负责企业智能助手。',
    verificationNotes: ['核实具体产品线'],
  },
  competencyMap: [1, 2, 3, 4, 5].map((rank) => ({
    rank,
    name: `能力${rank}`,
    jdEvidence: 'JD 明确强调。',
    roleUsage: '用于岗位日常工作。',
    proofSuggestion: '准备可核验案例。',
  })),
  companyMap: { stage: 'Realignment', summary: '正在校准方向。', priorities: ['验证场景'], culture: ['快速实验'] },
  dreamCandidateAvatar: {
    typicalDay: [{ time: '09:00', activity: '分析反馈', purpose: '识别假设' }],
    superpower: '把模糊需求变成实验。',
    successStory: '理想候选人推动指标改善。',
    quote: '先验证假设。',
    painProfile: '把 AI 能力转成用户价值。',
  },
  actionGuide: {
    selfIntroTagline: '把复杂场景变成可验证决策。',
    cultureFitPhrase: '用实验建立共识。',
    questions: ['问题一？', '问题二？', '问题三？'],
    verificationChecklist: ['核实负责产品'],
  },
};

const preview = {
  prompt: '详细岗位准备 Prompt',
  position: { company: detail.company, title: detail.title, location: detail.location, rawJd: detail.rawJd },
  selectedAssets: { projects: [], questions: [] },
  jobDataJson: JSON.stringify({
    position: { company: detail.company, title: detail.title, location: detail.location, rawJd: detail.rawJd },
    selectedAssets: { projects: [], questions: [] },
  }, null, 2),
};

const material: PreparationMaterial = {
  id: '55555555-5555-4555-8555-555555555555',
  positionId,
  rawJdSnapshot: detail.rawJd,
  promptSnapshot: preview.prompt,
  assetsSnapshot: JSON.stringify({ projects: [], questions: [] }),
  modelSnapshot: 'Doubao-Seed-2.0-mini',
  outputSnapshot: JSON.stringify(output),
  generatedAt: '2026-08-08T08:00:00.000Z',
  createdAt: '2026-08-08T08:00:00.000Z',
};

function renderPreparation(configure?: (fake: JobSearchApiFake) => void) {
  window.location.hash = `#/positions/${positionId}`;
  const fake = installJobSearchFake();
  fake.positions.get.mockResolvedValue(detail);
  fake.preparations.list.mockResolvedValue([]);
  fake.preparations.preview.mockResolvedValue(preview);
  fake.ai.settings.get.mockResolvedValue({
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'Doubao-Seed-2.0-mini',
    hasApiKey: true,
  });
  configure?.(fake);
  return { fake, user: userEvent.setup(), ...render(<App />) };
}

async function openPanel() {
  await screen.findByRole('heading', { name: '准备材料' });
}

describe('preparation flow', () => {
  it('sends only position data and starts generation in the background', async () => {
    const { fake, user } = renderPreparation((api) => {
      api.preparations.start.mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        kind: 'preparation',
        positionId,
        status: 'queued',
        safeError: null,
        createdAt: '2026-08-08T08:00:00.000Z',
        updatedAt: '2026-08-08T08:00:00.000Z',
        startedAt: null,
      });
    });
    await openPanel();
    await user.click(await screen.findByRole('button', { name: '生成准备材料' }));
    const dialog = screen.getByRole('dialog', { name: '生成准备材料' });
    expect(within(dialog).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(dialog).getByText(/不会读取项目档案或问题库/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '查看发送内容' }));
    await waitFor(() => expect(fake.preparations.preview).toHaveBeenCalledWith({ positionId }));
    expect(await within(dialog).findByText(/启用模型联网搜索/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '确认生成' }));
    await waitFor(() => expect(fake.preparations.start).toHaveBeenCalledWith({ positionId }));
    expect(screen.queryByRole('dialog', { name: '生成准备材料' })).not.toBeInTheDocument();
  });

  it('renders all five connected preparation sections', async () => {
    renderPreparation((api) => api.preparations.list.mockResolvedValue([material]));
    await openPanel();
    expect(await screen.findByText('公司与产品调研')).toBeInTheDocument();
    expect(screen.getByText('Map Competencies')).toBeInTheDocument();
    expect(screen.getByText('Company Map')).toBeInTheDocument();
    expect(screen.getByText('Dream Candidate Avatar')).toBeInTheDocument();
    expect(screen.getByText('Action Guide')).toBeInTheDocument();
    expect(screen.getByText('企业智能助手')).toBeInTheDocument();
  });

  it('blocks generation and links to settings when AI is not configured', async () => {
    const { user } = renderPreparation((api) => {
      api.ai.settings.get.mockResolvedValue({ baseUrl: '', model: '', hasApiKey: false });
    });
    await openPanel();
    await user.click(await screen.findByRole('button', { name: '生成准备材料' }));
    const dialog = screen.getByRole('dialog', { name: '生成准备材料' });
    expect(within(dialog).getByText(/外部 AI 配置尚未完成/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '前往设置' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '查看发送内容' })).toBeDisabled();
  });

  it('shows the safe background failure diagnostic and allows retry', async () => {
    const { user } = renderPreparation((api) => {
      api.tasks.listByPosition.mockResolvedValue([{
        id: '33333333-3333-4333-8333-333333333333',
        kind: 'preparation',
        positionId,
        status: 'failed',
        safeError: { message: 'The configured model is unavailable.', statusCode: 400, requestId: 'req-safe' },
        createdAt: '2026-08-08T08:00:00.000Z',
        updatedAt: '2026-08-08T08:00:00.000Z',
        startedAt: '2026-08-08T08:00:01.000Z',
      }]);
    });
    await openPanel();
    expect(await screen.findByText('The configured model is unavailable.')).toBeInTheDocument();
    expect(screen.getByText('req-safe')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新生成' }));
    expect(screen.getByRole('dialog', { name: '生成准备材料' })).toBeInTheDocument();
  });
});
