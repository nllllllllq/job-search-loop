import { useMemo, useState } from 'react';
import type { ProcessStage, ProcessStageInput } from '../../../shared/domain';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../hooks/useToast';
import { StageEditor } from './StageEditor';

interface StageTimelineProps {
  onRefresh: () => Promise<unknown>;
  positionId: string;
  stages: ProcessStage[];
}

export function StageTimeline({ onRefresh, positionId, stages }: StageTimelineProps) {
  const toast = useToast();
  const [editing, setEditing] = useState<ProcessStage | 'new' | null>(null);
  const [reordering, setReordering] = useState(false);
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.orderIndex - b.orderIndex),
    [stages],
  );

  const saveStage = async (input: ProcessStageInput & { id?: string }) => {
    try {
      await window.jobSearch.positions.saveStage(input);
      await onRefresh();
      setEditing(null);
      toast.success(input.id ? '流程阶段已更新' : '流程阶段已新增');
    } catch {
      toast.error('保存流程阶段失败，请稍后重试');
      throw new Error('stage save failed');
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (reordering) return;
    const target = index + direction;
    if (target < 0 || target >= sortedStages.length) return;
    const orderedIds = sortedStages.map((stage) => stage.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    setReordering(true);
    try {
      await window.jobSearch.positions.reorderStages(positionId, orderedIds);
      await onRefresh();
      toast.success('流程顺序已更新');
    } catch {
      toast.error('调整流程顺序失败，请稍后重试');
    } finally {
      setReordering(false);
    }
  };

  return (
    <section className="process-panel" aria-labelledby="process-title">
      <header className="process-panel__header">
        <div>
          <h3 id="process-title">推进记录</h3>
          <p>点击阶段即可记录实际日期、预计日期、反馈和备注；不会创建提醒。</p>
        </div>
      </header>

      {sortedStages.length === 0 ? (
        <p className="inline-empty">还没有流程阶段，可在更多流程设置中新增。</p>
      ) : (
        <ol className="stage-timeline" data-layout="wrapped-horizontal">
          {sortedStages.map((stage, index) => (
            <li className="stage-card" key={stage.id}>
              <button
                aria-label={`编辑流程阶段：${stage.name}`}
                className="stage-card__content"
                onClick={() => setEditing(stage)}
                type="button"
              >
                <span className="stage-card__step" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="stage-card__title">
                  <strong className="stage-card__name">{stage.name}</strong>
                  <StatusBadge stage={stage.canonicalStage} />
                </span>
                <span className="stage-card__dates">
                  {stage.actualDate ? (
                    <span className="stage-date stage-date--actual">实际日期：{stage.actualDate}</span>
                  ) : null}
                  {stage.expectedDate ? (
                    <span className="stage-date stage-date--expected">预计日期：{stage.expectedDate}</span>
                  ) : null}
                  {!stage.actualDate && !stage.expectedDate ? (
                    <span className="stage-date">日期未记录</span>
                  ) : null}
                </span>
                {stage.feedback ? (
                  <span className="stage-card__note"><strong>反馈</strong>{stage.feedback}</span>
                ) : null}
                {stage.notes ? (
                  <span className="stage-card__note"><strong>备注</strong>{stage.notes}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      )}

      <details className="process-settings">
        <summary>更多流程设置</summary>
        <div className="process-settings__body">
          <button
            className="button button--quiet"
            onClick={() => setEditing('new')}
            type="button"
          >
            新增自定义阶段
          </button>
          {sortedStages.length > 1 ? (
            <ol className="process-settings__list">
              {sortedStages.map((stage, index) => (
                <li key={stage.id}>
                  <span>{stage.name}</span>
                  <span className="process-settings__actions">
                    <button
                      aria-label={`上移 ${stage.name}`}
                      className="icon-button"
                      disabled={index === 0 || reordering}
                      onClick={() => void move(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`下移 ${stage.name}`}
                      className="icon-button"
                      disabled={index === sortedStages.length - 1 || reordering}
                      onClick={() => void move(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </details>

      <StageEditor
        initialValue={editing && editing !== 'new' ? editing : undefined}
        nextOrderIndex={
          sortedStages.length === 0
            ? 0
            : Math.max(...sortedStages.map((stage) => stage.orderIndex)) + 1
        }
        onClose={() => setEditing(null)}
        onSave={saveStage}
        open={editing !== null}
        positionId={positionId}
      />
    </section>
  );
}
