import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../src/renderer/hooks/useToast';
import { DashboardPage } from '../../src/renderer/features/dashboard/DashboardPage';
import { ProcessTimeline } from '../../src/renderer/features/dashboard/ProcessTimeline';
import { resetJobSearchFake } from '../helpers/bridge';
import type { Capability } from '../../src/shared/domain';

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
    expect(within(summaryCards).getAllByRole('article')).toHaveLength(4);
    expect(within(summaryCards).getByText('公司数量')).toBeInTheDocument();
    expect(within(summaryCards).getByText('累计岗位')).toBeInTheDocument();
    expect(within(summaryCards).getByText('进入面试')).toBeInTheDocument();
    expect(within(summaryCards).getByText('完成复盘')).toBeInTheDocument();
    expect(within(summaryCards).queryByText('待确认建议')).not.toBeInTheDocument();
    expect(within(summaryCards).getAllByText('2', { selector: '.dashboard-stat__value' })).toHaveLength(2);
    expect(screen.getAllByText('面试进行时间')).toHaveLength(2);
    expect(screen.getByText('只显示今天及未来的测评与面试进行时间')).toBeInTheDocument();
    expect(screen.getByLabelText('首页快捷入口')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /待确认清单/ })).not.toBeInTheDocument();
    expect(screen.queryByText('待确认清单')).not.toBeInTheDocument();
    expect(screen.queryByText('LOOP OVERVIEW / 求职进度')).not.toBeInTheDocument();
    expect(screen.queryByText('近期岗位')).not.toBeInTheDocument();
    expect(summaryCards.nextElementSibling).toHaveClass('dashboard-panel--wide');
    expect(summaryCards.nextElementSibling).toHaveTextContent('待完成安排');

    await userEvent.click(screen.getByRole('button', { name: '分析共性能力' }));
    const checkboxes = await screen.findAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((checkbox) => !checkbox.hasAttribute('checked'))).toBe(true);
    expect(fake.system.previewCapabilityAnalysis).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '取消分析' }));
    expect(fake.system.confirmCapabilityAnalysis).not.toHaveBeenCalled();
  });

  it('keeps structured analysis results open and saves one capability only after confirmation', async () => {
    const fake = resetJobSearchFake();
    const positions = [{
      id: '11111111-1111-4111-8111-111111111111',
      company: '甲公司',
      title: 'AI 产品经理',
      location: '',
      interest: 5 as const,
      currentStage: 'interview' as const,
      finalResult: null,
      updatedAt: '2026-08-02T00:00:00.000Z',
    }, {
      id: '22222222-2222-4222-8222-222222222222',
      company: '乙公司',
      title: '产品经理',
      location: '',
      interest: 4 as const,
      currentStage: 'applied' as const,
      finalResult: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    }];
    fake.system.getDashboardSummary.mockResolvedValue({
      totalPositions: 2,
      companyCount: 2,
      stageDistribution: [{ stage: 'interview', count: 1 }],
      positionsWithInterviews: 1,
      completedReviews: 0,
      pendingProposals: 0,
      processEvents: [],
      capabilityFrequency: [],
      recentPositions: [],
    });
    fake.positions.list.mockResolvedValue(positions);
    fake.system.previewCapabilityAnalysis.mockResolvedValue({
      token: '33333333-3333-4333-8333-333333333333',
      provider: 'https://api.example.com',
      model: 'analysis-model',
      prompt: '分析能力',
      positions: positions.map((position) => ({
        id: position.id,
        label: `${position.company} · ${position.title}`,
        rawJd: `${position.company} JD`,
      })),
    });
    fake.system.confirmCapabilityAnalysis.mockResolvedValue({
      capabilities: [{
        name: '用户研究',
        jdFrequency: 2,
        evidence: ['JD-A 提及用户研究'],
        gaps: ['补充量化案例'],
      }, {
        name: '跨团队协作',
        jdFrequency: 1,
        evidence: ['JD-B 提及协作'],
        gaps: [],
      }],
    });
    fake.assets.capabilities.save.mockResolvedValue({
      ...capability,
      name: '用户研究',
      jdFrequency: 2,
      evidence: 'JD-A 提及用户研究',
      gaps: '补充量化案例',
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider defaultDuration={0}>
          <DashboardPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: '分析共性能力' }));
    await user.click((await screen.findAllByRole('checkbox'))[0]!);
    await user.click((await screen.findAllByRole('checkbox'))[1]!);
    await user.click(screen.getByRole('button', { name: '查看发送内容' }));
    await user.click(screen.getByRole('button', { name: '确认发送并分析' }));

    const analysis = await screen.findByRole('dialog', { name: '分析共性能力' });
    expect(within(analysis).getByText('用户研究')).toBeInTheDocument();
    expect(within(analysis).getByText('跨团队协作')).toBeInTheDocument();
    expect(within(analysis).getByText('JD-A 提及用户研究')).toBeInTheDocument();
    expect(within(analysis).getByText('补充量化案例')).toBeInTheDocument();
    expect(within(analysis).queryByText(/待确认能力建议|重复分析/)).not.toBeInTheDocument();
    expect(fake.assets.capabilities.save).not.toHaveBeenCalled();

    await user.click(within(analysis).getAllByRole('button', { name: '纳入能力' })[0]!);
    const editor = await screen.findByRole('dialog', { name: '纳入能力' });
    expect(within(editor).getByLabelText(/能力名称/)).toHaveValue('用户研究');
    await user.click(within(editor).getByRole('button', { name: '确认纳入能力' }));

    await waitFor(() => expect(fake.assets.capabilities.save).toHaveBeenCalledWith({
      name: '用户研究',
      jdFrequency: 2,
      evidence: 'JD-A 提及用户研究',
      gaps: '补充量化案例',
      mergedIntoId: null,
    }));
    expect(await within(analysis).findByRole('button', { name: '已纳入' })).toBeInTheDocument();
    expect(within(analysis).getByRole('button', { name: '纳入能力' })).toBeInTheDocument();
    expect(fake.assets.capabilities.save).toHaveBeenCalledTimes(1);
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

    expect(await screen.findByText('首页加载失败')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(fake.system.getDashboardSummary).toHaveBeenCalledTimes(2));
  });

  it('shows only the ten nearest upcoming process dates', () => {
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
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
    expect(screen.queryByText('2026-08-11')).not.toBeInTheDocument();
  });

  it('does not render or load the review entry from a legacy drawer query', async () => {
    const fake = resetJobSearchFake();
    render(
      <MemoryRouter initialEntries={['/?drawer=reviews']}>
        <ToastProvider defaultDuration={0}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('求职进度摘要')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '待确认清单' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /待确认清单/ })).not.toBeInTheDocument();
    expect(fake.reviews.proposals.list).not.toHaveBeenCalled();
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
