import { useState } from 'react';
import type { AppError } from '../../../shared/ipc';
import { Modal } from '../../components/Modal';
import { useToast } from '../../hooks/useToast';

function errorCode(error: unknown): AppError['code'] | null {
  if (
    error !== null
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
  ) {
    return error.code as AppError['code'];
  }
  return null;
}

export function BackupSection() {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  const exportBackup = async () => {
    if (exporting || restoring) return;
    setExporting(true);
    try {
      const result = await window.jobSearch.system.exportBackup();
      if (result.status === 'exported') toast.success('本地备份已导出');
    } catch {
      toast.error('导出失败，当前数据没有被修改。');
    } finally {
      setExporting(false);
    }
  };

  const restoreBackup = async () => {
    if (exporting || restoring) return;
    setRestoring(true);
    try {
      const result = await window.jobSearch.system.restoreBackup();
      if (result.status === 'restored') {
        setConfirmingRestore(false);
        toast.success('恢复完成，应用即将重启');
      }
    } catch (error) {
      toast.error(
        errorCode(error) === 'BACKUP_INVALID'
          ? '恢复失败，请确认选择的是有效备份文件。'
          : '恢复失败，恢复前的数据已保留。',
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <section
        aria-labelledby="backup-title"
        className="settings-section backup-section"
      >
        <div className="settings-section__heading">
          <div>
            <p className="section-label">ARCHIVE / 本地归档</p>
            <h3 id="backup-title">业务数据备份与恢复</h3>
          </div>
          <p>备份只包含求职记录、复盘与长期资产；AI 地址、模型和 API Key 不会写入备份。</p>
        </div>
        <div className="backup-section__body">
          <div className="backup-section__note">
            <strong>一份可迁移的本地快照</strong>
            <p>导出为 .jobloop 文件。恢复前会先校验文件，并保留当前数据库的回滚副本。</p>
          </div>
          <div className="backup-section__actions">
            <button
              className="button button--primary"
              disabled={exporting || restoring}
              onClick={() => void exportBackup()}
              type="button"
            >
              {exporting ? '正在导出…' : '导出本地备份'}
            </button>
            <button
              className="button button--danger"
              disabled={exporting || restoring}
              onClick={() => setConfirmingRestore(true)}
              type="button"
            >
              从备份恢复
            </button>
          </div>
        </div>
      </section>

      <Modal
        closeDisabled={restoring}
        footer={(
          <>
            <button
              className="button button--quiet"
              disabled={restoring}
              onClick={() => setConfirmingRestore(false)}
              type="button"
            >
              取消恢复
            </button>
            <button
              className="button button--danger"
              disabled={restoring}
              onClick={() => void restoreBackup()}
              type="button"
            >
              {restoring ? '正在校验并恢复…' : '确认恢复并重启'}
            </button>
          </>
        )}
        onClose={() => setConfirmingRestore(false)}
        open={confirmingRestore}
        title="确认替换当前数据"
      >
        <div className="backup-confirmation">
          <p className="backup-confirmation__warning">
            所选备份会替换当前业务数据并重启应用。
          </p>
          <p>
            系统会先检查备份结构与完整性；如果恢复失败，会自动尝试回到恢复前的数据。
            AI 配置和 API Key 保持不变。
          </p>
        </div>
      </Modal>
    </>
  );
}
