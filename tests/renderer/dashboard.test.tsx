import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../src/renderer/hooks/useToast';
import { DashboardPage } from '../../src/renderer/features/dashboard/DashboardPage';
import { ProcessTimeline } from '../../src/renderer/features/dashboard/ProcessTimeline';
import { resetJobSearchFake } from '../helpers/bridge';
import type { Capability, ChangeProposalListItem } from '../../src/shared/domain';

const pendingProposal: ChangeProposalListItem = {
  id: '33333333-3333-4333-8333-333333333333',
  targetType: 'question',
  targetId: null,
  operation: 'create',
  payload: {
    type: 'interviewer',
    text: '如何判断需求优先级？',
    answerDraft: '先说目标，再说证据。',
    projectIds: [],
    capabilityIds: [],
    occurrenceCount: 1,
    status: 'active',
  },
  rationale: '值得沉淀',
  positionId: '11111111-1111-4111-8111-111111111111',
  interviewId: '22222222-2222-4222-8222-222222222222',
  analysisRunId: null,
  status: 'pending',
  acceptedPayload: null,
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T10:00:00.000Z',
  resolvedAt: null,
  context: {
    position: { company: '远山科技', title: 'AI 产品经理' },
    interview: { roundName: '业务一面', interviewDate: '2026-07-27' },
  },
};

const capability: Capability = {
  id: '44444444-4444-4444-8444-444444444444',
  name: '问题拆解',
  jdFrequency: 5,
  evidence: '完成用户研究',
  gaps: '缺少量化结果',
  mergedIntoId: null,
  createdAt: '2026-07-27T08:00:00.000Z',
  updatedAt: '2026-07-27T08:00:00.000Z',
};

describe('dashboard page', () => {
  beforeEach(() => {
    resetJobSearchFake();
  });

  it('renders summary, distinguishes date types and requires explicit position selection', async () => {
    const fake = resetJobSearchFake();
    fake.system.getDashboardSummary.mockResolvedValue({
      totalPositions: 2,
      companyCount: 2,
      stageDistribution: [{ stage: 'interview', count: 2 }],
      positionsWithInterviews: 1,
      completedReviews: 1,
      pendingProposals: 2,
      processEvents: [{
        positionId: '11111111-1111-4111-8111-111111111111',
        positionLabel: '甲公司 · AI 产品经理',
        stageName: '业务面谈',
        canonicalStage: 'interview',
        date: '2026-08-02',
        dateType: 'actual',
      }, {
        positionId: '22222222-2222-4222-8222-222222222222',
        positionLabel: '乙公司 · 产品经理',
        stageName: '终面',
        canonicalStage: 'interview',
        date: '2026-08-03',
        dateType: 'expected',
      }],
      capabilityFrequency: [{
        capabilityId: '33333333-3333-4333-8333-333333333333',
        name: '用户研究',
        jdFrequency: 2,
        evidenceCount: 1,
      }],
      recentPositions: [{
        id: '11111111-1111-4111-8111-111111111111',
        company: '甲公司',
        title: 'AI 产品经理',
        location: '',
        interest: 5,
        currentStage: 'interview',
        finalResult: null,
        updatedAt: '2026-08-02T00:00:00.000Z',
      }],
    });
    fake.positions.list.mockResolvedValue([{
      id: '11111111-1111-4111-8111-111111111111',
      company: '甲公司',
      title: 'AI 产品经理',
      location: '',
      interest: 5,
      currentStage: 'interview',
      finalResult: null,
      updatedAt: '2026-08-02T00:00:00.000Z',
    }, {
      id: '22222222-2222-4222-8222-222222222222',
      company: '乙公司',
      title: '产品经理',
      location: '',
      interest: 4,
      currentStage: 'applied',
      finalResult: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    }]);

    render(
      <MemoryRouter>
        <ToastProvider defaultDuration={0}>
          <DashboardPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    const summaryCards = await screen.findByLabelText('求职进度摘要');
    expect(within(summaryCards).getAllByRole('article')).toHaveLength(5);
    expect(within(summaryCards).getByText('公司数量')).toBeInTheDocument();
    expect(within(summaryCards).getByText('累计岗位')).toBeInTheDocument();
    expect(within(summaryCards).getByText('进入面试')).toBeInTheDocument();
    expect(within(summaryCards).getByText('完成复盘')).toBeInTheDocument();
    expect(within(summaryCards).getByText('待确认建议')).toBeInTheDocument();
    expect(within(summaryCards).getAllByText('2', { selector: '.dashboard-stat__value' })).toHaveLength(3);
    expect(screen.getByText('实际日期')).toBeInTheDocument();
    expect(screen.getByText('预计日期')).toBeInTheDocument();
    expect(screen.getByText('日期仅用于记录流程，不会创建提醒')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '分析共性能力' }));
    const checkboxes = await screen.findAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((checkbox) => !checkbox.hasAttribute('checked'))).toBe(true);
    expect(fake.system.previewCapabilityAnalysis).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '取消分析' }));
    expect(fake.system.confirmCapabilityAnalysis).not.toHaveBeenCalled();
  });

  it('shows a recoverable load error', async () => {
    const fake = resetJobSearchFake();
    fake.system.getDashboardSummary.mockRejectedValue(new Error('database unavailable'));
    render(
      <MemoryRouter>
        <ToastProvider>
          <DashboardPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('总览加载失败')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(fake.system.getDashboardSummary).toHaveBeenCalledTimes(2));
  });

  it('shows only the ten newest process dates', () => {
    const events = Array.from({ length: 11 }, (_, index) => ({
      positionId: `11111111-1111-4111-8111-11111111111${index}`,
      positionLabel: `公司${index} · 岗位`,
      stageName: '投递',
      canonicalStage: 'applied' as const,
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      dateType: 'actual' as const,
    }));
    render(<MemoryRouter><ProcessTimeline events={events} /></MemoryRouter>);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('2026-08-11')).toBeInTheDocument();
    expect(screen.queryByText('2026-08-01')).not.toBeInTheDocument();
  });

  it('opens review pending/history in one drawer without per-card context IPC', async () => {
    const fake = resetJobSearchFake();
    fake.reviews.proposals.list.mockResolvedValue({
      items: [
        pendingProposal,
        {
          ...pendingProposal,
          id: '55555555-5555-4555-8555-555555555555',
          rationale: '已处理建议',
          status: 'ignored',
          resolvedAt: '2026-07-28T10:00:00.000Z',
        },
      ],
      corruptItems: [],
      corruptCount: 0,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/?drawer=reviews']}>
        <ToastProvider defaultDuration={0}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    const drawer = await screen.findByRole('dialog', { name: '待确认清单' });
    expect(await within(drawer).findByRole('button', { name: '待处理 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(drawer).getByText('远山科技 · AI 产品经理')).toBeInTheDocument();
    expect(within(drawer).getByText('业务一面 · 2026-07-27')).toBeInTheDocument();
    expect(fake.positions.get).not.toHaveBeenCalled();
    expect(fake.reviews.interviews.get).not.toHaveBeenCalled();

    await user.click(within(drawer).getByRole('button', { name: '历史 1' }));
    expect(within(drawer).getByText('已处理建议')).toBeInTheDocument();
    expect(within(drawer).queryByText('值得沉淀')).not.toBeInTheDocument();
  });

  it('opens the capability drawer and creates, edits, and transactionally merges', async () => {
    const target: Capability = {
      ...capability,
      id: '66666666-6666-4666-8666-666666666666',
      name: '战略思考',
    };
    const fake = resetJobSearchFake();
    fake.assets.capabilities.list.mockResolvedValue([capability, target]);
    fake.assets.capabilities.save.mockImplementation(async (input) => ({
      ...capability,
      ...input,
      id: input.id ?? '77777777-7777-4777-8777-777777777777',
    }));
    fake.assets.capabilities.merge.mockResolvedValue({
      source: { ...capability, mergedIntoId: target.id },
      target: { ...target, jdFrequency: target.jdFrequency + capability.jdFrequency },
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/?drawer=capabilities']}>
        <ToastProvider defaultDuration={0}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    const drawer = await screen.findByRole('dialog', { name: '能力主题' });
    expect(await within(drawer).findByText('问题拆解')).toBeInTheDocument();
    expect(within(drawer).getAllByText('JD 频次 5')).toHaveLength(2);

    await user.click(within(drawer).getByRole('button', { name: '新增能力' }));
    await user.type(screen.getByLabelText(/能力名称/), '沟通协调');
    await user.click(screen.getByRole('button', { name: '保存能力' }));
    await waitFor(() => expect(fake.assets.capabilities.save).toHaveBeenCalledWith({
      name: '沟通协调',
      jdFrequency: 0,
      evidence: '',
      gaps: '',
      mergedIntoId: null,
    }));

    await user.click(within(drawer).getByRole('button', { name: '合并 问题拆解' }));
    expect(screen.getByLabelText(/能力名称/)).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/合并到/), target.id);
    expect(screen.getByText('原能力记录保留用于审计；现有关联会迁移到目标能力。'))
      .toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认合并' }));
    await waitFor(() => expect(fake.assets.capabilities.merge).toHaveBeenCalledWith(
      capability.id,
      target.id,
    ));
  });
});
