import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../src/renderer/hooks/useToast';
import { DashboardPage } from '../../src/renderer/features/dashboard/DashboardPage';
import { resetJobSearchFake } from '../helpers/bridge';

describe('dashboard page', () => {
  beforeEach(() => {
    resetJobSearchFake();
  });

  it('renders summary, distinguishes date types and requires explicit position selection', async () => {
    const fake = resetJobSearchFake();
    fake.system.getDashboardSummary.mockResolvedValue({
      totalPositions: 2,
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
      interest: 5,
      currentStage: 'interview',
      finalResult: null,
      updatedAt: '2026-08-02T00:00:00.000Z',
    }, {
      id: '22222222-2222-4222-8222-222222222222',
      company: '乙公司',
      title: '产品经理',
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

    expect(await screen.findByText('累计岗位')).toBeInTheDocument();
    expect(screen.getAllByText('2', { selector: '.dashboard-stat__value' })).toHaveLength(2);
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
});
