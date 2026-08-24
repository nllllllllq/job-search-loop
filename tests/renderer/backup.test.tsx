import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BackupSection } from '../../src/renderer/features/settings/BackupSection';
import { ToastProvider } from '../../src/renderer/hooks/useToast';
import { createJobSearchFake, installJobSearchFake } from '../helpers/bridge';

function renderBackup() {
  return render(
    <ToastProvider>
      <BackupSection />
    </ToastProvider>,
  );
}

describe('backup settings section', () => {
  it('exports through the native bridge and reports completion', async () => {
    const fake = createJobSearchFake();
    fake.system.exportBackup.mockResolvedValue({ status: 'exported' });
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderBackup();
    await user.click(screen.getByRole('button', { name: '导出本地备份' }));

    expect(fake.system.exportBackup).toHaveBeenCalledOnce();
    expect((await screen.findAllByText('本地备份已导出'))[0]).toBeVisible();
  });

  it('requires destructive confirmation and keeps cancellation safe', async () => {
    const fake = createJobSearchFake();
    fake.system.restoreBackup.mockResolvedValue({ status: 'restored' });
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderBackup();
    await user.click(screen.getByRole('button', { name: '从备份恢复' }));
    expect(screen.getByRole('dialog', { name: '确认替换当前数据' })).toBeVisible();
    expect(screen.getByText(/会替换当前业务数据并重启应用/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: '取消恢复' }));
    expect(fake.system.restoreBackup).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '从备份恢复' }));
    await user.click(screen.getByRole('button', { name: '确认恢复并重启' }));
    await waitFor(() => expect(fake.system.restoreBackup).toHaveBeenCalledOnce());
    expect((await screen.findAllByText('恢复完成，应用即将重启'))[0]).toBeVisible();
  });

  it('keeps errors generic and prevents duplicate restore submissions', async () => {
    const fake = createJobSearchFake();
    let rejectRestore!: (reason: unknown) => void;
    fake.system.restoreBackup.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectRestore = reject;
    }));
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderBackup();
    await user.click(screen.getByRole('button', { name: '从备份恢复' }));
    const confirm = screen.getByRole('button', { name: '确认恢复并重启' });
    await user.dblClick(confirm);
    expect(fake.system.restoreBackup).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '正在校验并恢复…' })).toBeDisabled();

    rejectRestore({
      code: 'BACKUP_INVALID',
      message: 'C:\\Users\\secret\\damaged.jobloop',
    });
    expect((await screen.findAllByText('恢复失败，请确认选择的是有效备份文件。'))[0])
      .toBeVisible();
    expect(document.body).not.toHaveTextContent('C:\\Users\\secret');
  });

  it('shows safe rollback summaries and can deep-check then delete one', async () => {
    const fake = createJobSearchFake();
    fake.system.listRollbacks.mockResolvedValue([{
      id: 'live.sqlite.rollback-safe.jobloop',
      label: '恢复前副本 · 2026/7/28 18:00:00',
      createdAt: '2026-07-28T10:00:00.000Z',
      size: 2048,
      quickStatus: 'valid',
      deepStatus: 'unchecked',
    }]);
    fake.system.checkRollback.mockResolvedValue({
      id: 'live.sqlite.rollback-safe.jobloop',
      label: '恢复前副本 · 2026/7/28 18:00:00',
      createdAt: '2026-07-28T10:00:00.000Z',
      size: 2048,
      quickStatus: 'valid',
      deepStatus: 'valid',
    });
    installJobSearchFake(fake);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderBackup();
    expect(await screen.findByText('恢复前副本 · 2026/7/28 18:00:00')).toBeVisible();
    expect(screen.queryByText(/C:\\/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '深度校验' }));
    expect(fake.system.checkRollback).toHaveBeenCalledWith(
      'live.sqlite.rollback-safe.jobloop',
      true,
    );
    expect(await screen.findByText('深度校验通过')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '删除副本' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(fake.system.deleteRollback).toHaveBeenCalledWith(
      'live.sqlite.rollback-safe.jobloop',
    );
  });

  it('reports restore progress and allows cancellation before replacement', async () => {
    const fake = createJobSearchFake();
    let resolveRestore!: (value: { status: 'cancelled' }) => void;
    fake.system.restoreBackup.mockImplementation(() => new Promise((resolve) => {
      resolveRestore = resolve;
    }));
    fake.system.getBackupProgress.mockResolvedValue({
      operation: 'restore',
      phase: 'ready-to-replace',
      percent: 65,
      cancellable: true,
      active: true,
    });
    fake.system.cancelBackup.mockImplementation(async () => {
      resolveRestore({ status: 'cancelled' });
      return { status: 'cancelled' };
    });
    installJobSearchFake(fake);
    const user = userEvent.setup();

    renderBackup();
    await user.click(screen.getByRole('button', { name: '从备份恢复' }));
    await user.click(screen.getByRole('button', { name: '确认恢复并重启' }));
    expect(await screen.findByText('准备替换 · 65%')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '取消本次恢复' }));
    expect(fake.system.cancelBackup).toHaveBeenCalledOnce();
    expect((await screen.findAllByText('恢复已取消，当前数据未改变'))[0]).toBeVisible();
  });
});
