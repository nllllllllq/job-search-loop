import { useCallback, useEffect, useState } from 'react';
import type {
  AppError,
  BackupProgress,
  RollbackSummary,
} from '../../../shared/ipc';
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
  const [deepCheck, setDeepCheck] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [rollbacks, setRollbacks] = useState<RollbackSummary[]>([]);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const loadRollbacks = useCallback(async () => {
    try {
      setRollbacks(await window.jobSearch.system.listRollbacks());
    } catch {
      toast.error('回滚副本列表暂时无法读取。');
    }
  }, [toast]);

  useEffect(() => {
    void loadRollbacks();
  }, [loadRollbacks]);

  useEffect(() => {
    if (!exporting && !restoring) return undefined;
    let mounted = true;
    const poll = async () => {
      try {
        const next = await window.jobSearch.system.getBackupProgress();
        if (mounted) setProgress(next);
      } catch {
        // The operation result will show the actionable error.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 200);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [exporting, restoring]);

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
      const result = await window.jobSearch.system.restoreBackup({ deepCheck });
      if (result.status === 'restored') {
        setConfirmingRestore(false);
        toast.success('恢复完成，应用即将重启');
      } else if (result.status === 'cancelled') {
        setConfirmingRestore(false);
        toast.success('恢复已取消，当前数据未改变');
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

  const cancelRestore = async () => {
    const result = await window.jobSearch.system.cancelBackup();
    if (result.status === 'not-cancellable') {
      toast.error('已进入数据库替换阶段，现在不能中断。');
    }
  };

  const checkRollback = async (item: RollbackSummary) => {
    if (checkingId !== null) return;
    setCheckingId(item.id);
    try {
      const checked = await window.jobSearch.system.checkRollback(item.id, true);
      setRollbacks((current) => current.map((candidate) => (
        candidate.id === checked.id ? checked : candidate
      )));
    } catch {
      toast.error('深度校验失败，该副本不会用于恢复。');
    } finally {
      setCheckingId(null);
    }
  };

  const deleteRollback = async (item: RollbackSummary) => {
    if (!window.confirm(`删除“${item.label}”？此操作无法撤销。`)) return;
    try {
      await window.jobSearch.system.deleteRollback(item.id);
      setRollbacks((current) => current.filter((candidate) => candidate.id !== item.id));
      toast.success('回滚副本已删除');
    } catch {
      toast.error('删除失败，副本仍被保留。');
    }
  };

  const progressLabel = progress?.phase === 'ready-to-replace'
    ? '准备替换'
    : progress?.phase === 'replacing'
      ? '正在原子替换（不可中断）'
      : progress?.phase === 'creating-rollback'
        ? '正在创建回滚副本'
        : progress?.phase === 'validating-source'
          ? '正在校验备份'
          : progress?.phase === 'staging'
            ? '正在暂存'
            : null;

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
          {progress?.active && progressLabel ? (
            <div aria-live="polite" className="backup-progress">
              <span>{progressLabel} · {progress.percent}%</span>
              <progress max={100} value={progress.percent} />
            </div>
          ) : null}
          <div className="backup-rollbacks">
            <div>
              <strong>最近回滚副本</strong>
              <p>仅显示已通过快速校验的最近 3 份副本；深度校验可能需要几分钟。</p>
            </div>
            {rollbacks.length === 0 ? (
              <p className="empty-state">暂无可用回滚副本</p>
            ) : (
              <ul>
                {rollbacks.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{(item.size / 1024).toFixed(1)} KB · 快速校验通过</span>
                      {item.deepStatus === 'valid' ? <span>深度校验通过</span> : null}
                    </div>
                    <div className="backup-section__actions">
                      <button
                        className="button button--quiet"
                        disabled={checkingId !== null}
                        onClick={() => void checkRollback(item)}
                        type="button"
                      >
                        {checkingId === item.id ? '校验中…' : '深度校验'}
                      </button>
                      <button
                        className="button button--quiet"
                        onClick={() => void deleteRollback(item)}
                        type="button"
                      >
                        删除副本
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <Modal
        closeDisabled={restoring}
        footer={(
          <>
            {restoring && progress?.cancellable ? (
              <button
                className="button button--quiet"
                onClick={() => void cancelRestore()}
                type="button"
              >
                取消本次恢复
              </button>
            ) : (
              <button
                className="button button--quiet"
                disabled={restoring}
                onClick={() => setConfirmingRestore(false)}
                type="button"
              >
                取消恢复
              </button>
            )}
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
          <label className="field field--checkbox">
            <input
              checked={deepCheck}
              disabled={restoring}
              onChange={(event) => setDeepCheck(event.target.checked)}
              type="checkbox"
            />
            <span>
              恢复前执行深度完整性校验
              <small>数据量较大时可能需要数分钟。</small>
            </span>
          </label>
        </div>
      </Modal>
    </>
  );
}
