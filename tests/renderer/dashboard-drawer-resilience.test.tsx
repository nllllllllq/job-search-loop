import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Capability,
  ChangeProposalListResult,
  DashboardSummary,
} from '../../src/shared/domain';
import { Modal } from '../../src/renderer/components/Modal';
import { CapabilityDrawer } from '../../src/renderer/features/dashboard/CapabilityDrawer';
import { DashboardDrawer } from '../../src/renderer/features/dashboard/DashboardDrawer';
import { DashboardPage } from '../../src/renderer/features/dashboard/DashboardPage';
import { ReviewDrawer } from '../../src/renderer/features/dashboard/ReviewDrawer';
import { ToastProvider } from '../../src/renderer/hooks/useToast';
import { resetJobSearchFake } from '../helpers/bridge';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const emptySummary: DashboardSummary = {
  totalPositions: 0,
  stageDistribution: [],
  positionsWithInterviews: 0,
  completedReviews: 0,
  pendingProposals: 0,
  processEvents: [],
  capabilityFrequency: [],
  recentPositions: [],
};

const firstCapability: Capability = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '旧请求能力',
  jdFrequency: 1,
  evidence: '',
  gaps: '',
  mergedIntoId: null,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

const secondCapability: Capability = {
  ...firstCapability,
  id: '22222222-2222-4222-8222-222222222222',
  name: '新请求能力',
};

describe('dashboard drawer resilience', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
    resetJobSearchFake();
  });

  it.each([
    ['pending', () => deferred<DashboardSummary>().promise],
    ['rejected', () => Promise.reject(new Error('summary unavailable'))],
  ])('keeps a deep-linked review drawer usable while summary is %s', async (_case, summary) => {
    const fake = resetJobSearchFake();
    fake.system.getDashboardSummary.mockImplementation(summary);

    render(
      <MemoryRouter initialEntries={['/?drawer=reviews']}>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByRole('button', { name: /待处理|寰呭鐞?/ }))
      .toBeInTheDocument();
    if (_case === 'rejected') {
      expect(await screen.findByText(/总览加载失败|鎬昏鍔犺浇澶辫触/)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBe(drawer);
    }
  });

  it('keeps the review drawer mounted while an accepted proposal reloads summary', async () => {
    const fake = resetJobSearchFake();
    const reload = deferred<DashboardSummary>();
    fake.system.getDashboardSummary
      .mockResolvedValueOnce(emptySummary)
      .mockReturnValueOnce(reload.promise);
    const proposal = {
      id: '33333333-3333-4333-8333-333333333333',
      targetType: 'insight' as const,
      targetId: null,
      operation: 'create' as const,
      payload: {
        title: '复盘',
        content: '保持抽屉上下文',
        positionId: null,
        projectId: null,
        questionId: null,
        capabilityId: null,
      },
      rationale: '测试重载',
      positionId: null,
      interviewId: null,
      analysisRunId: null,
      status: 'pending' as const,
      acceptedPayload: null,
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
      resolvedAt: null,
      context: { position: null, interview: null },
    };
    fake.reviews.proposals.list.mockResolvedValue({
      items: [proposal],
      corruptItems: [],
      corruptCount: 0,
    });
    fake.reviews.proposals.accept.mockResolvedValue({
      ...proposal,
      status: 'accepted',
      resolvedAt: '2026-07-28T01:00:00.000Z',
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

    const drawer = await screen.findByRole('dialog');
    await user.click(await within(drawer).findByRole('button', { name: /^(接受|鎺ュ彈)$/ }));
    await waitFor(() => expect(fake.system.getDashboardSummary).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('dialog')).toBe(drawer);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('traps focus, delegates nested Escape to the modal, and restores focus and scroll lock', async () => {
    function Harness() {
      const [drawerOpen, setDrawerOpen] = useState(false);
      const [modalOpen, setModalOpen] = useState(false);
      return (
        <>
          <button onClick={() => setDrawerOpen(true)} type="button">打开抽屉</button>
          <DashboardDrawer
            eyebrow="TEST"
            onClose={() => setDrawerOpen(false)}
            open={drawerOpen}
            title="测试抽屉"
          >
            <button onClick={() => setModalOpen(true)} type="button">打开内层</button>
            <button type="button">最后操作</button>
            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="内层窗口">
              内层内容
            </Modal>
          </DashboardDrawer>
        </>
      );
    }

    document.body.style.overflow = 'auto';
    const user = userEvent.setup();
    render(<Harness />);
    const launcher = screen.getByRole('button', { name: '打开抽屉' });
    launcher.focus();
    await user.click(launcher);

    const drawer = screen.getByRole('dialog', { name: '测试抽屉' });
    const close = within(drawer).getByRole('button', { name: '关闭测试抽屉' });
    expect(close).toHaveFocus();
    expect(document.querySelector('.dashboard-drawer__backdrop')).not.toHaveAttribute(
      'tabindex',
    );
    const last = within(drawer).getByRole('button', { name: '最后操作' });
    launcher.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    await user.click(within(drawer).getByRole('button', { name: '打开内层' }));
    const modal = screen.getByRole('dialog', { name: '内层窗口' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '测试抽屉' })).toBeInTheDocument();
    expect(modal).toBeInTheDocument();
    fireEvent(modal, new Event('cancel', { bubbles: false, cancelable: true }));
    expect(screen.queryByRole('dialog', { name: '内层窗口' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '测试抽屉' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('auto');
    expect(launcher).toHaveFocus();
  });

  it('ignores a stale review load after close and reopen', async () => {
    const first = deferred<ChangeProposalListResult>();
    const fake = resetJobSearchFake();
    fake.reviews.proposals.list
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ items: [], corruptItems: [], corruptCount: 0 });

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen((value) => !value)} type="button">切换</button>
          <ReviewDrawer onClose={() => setOpen(false)} open={open} />
        </>
      );
    }

    const user = userEvent.setup();
    render(<ToastProvider><Harness /></ToastProvider>);
    await user.click(screen.getByRole('button', { name: '切换' }));
    await user.click(screen.getByRole('button', { name: '切换' }));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText(/当前没有待处理建议|褰撳墠娌℃湁寰呭鐞嗗缓璁?/))
      .toBeInTheDocument();

    await act(async () => {
      first.reject(new Error('stale failure'));
      try {
        await first.promise;
      } catch {
        // The stale request is expected to fail.
      }
    });
    expect(within(drawer).queryByText(/读取失败|璇诲彇澶辫触/)).not.toBeInTheDocument();
  });

  it('ignores stale capability results completed after a newer reopen load', async () => {
    const first = deferred<Capability[]>();
    const fake = resetJobSearchFake();
    fake.assets.capabilities.list
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([secondCapability]);

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen((value) => !value)} type="button">切换</button>
          <CapabilityDrawer onClose={() => setOpen(false)} open={open} />
        </>
      );
    }

    const user = userEvent.setup();
    render(<ToastProvider><Harness /></ToastProvider>);
    await user.click(screen.getByRole('button', { name: '切换' }));
    await user.click(screen.getByRole('button', { name: '切换' }));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText(secondCapability.name)).toBeInTheDocument();

    await act(async () => {
      first.resolve([firstCapability]);
      await first.promise;
    });
    expect(within(drawer).getByText(secondCapability.name)).toBeInTheDocument();
    expect(within(drawer).queryByText(firstCapability.name)).not.toBeInTheDocument();
  });

  it('keeps drawer content and actions inside a viewport-scrolling body', () => {
    render(
      <DashboardDrawer eyebrow="TEST" onClose={() => undefined} open title="布局抽屉">
        <button type="button">关键操作</button>
      </DashboardDrawer>,
    );

    const drawer = screen.getByRole('dialog', { name: '布局抽屉' });
    expect(drawer).toHaveClass('dashboard-drawer');
    expect(within(drawer).getByText('关键操作').closest('.dashboard-drawer__body'))
      .toBeInTheDocument();
    expect(document.querySelector('.dashboard-drawer-layer')).toHaveClass(
      'dashboard-drawer-layer',
    );
  });
});
