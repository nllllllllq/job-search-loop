import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
});
