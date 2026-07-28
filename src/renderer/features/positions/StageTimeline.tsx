import { useMemo, useState } from 'react';
import type { ProcessStage, ProcessStageInput } from '../../../shared/domain';
import { useToast } from '../../hooks/useToast';
import { StageEditor } from './StageEditor';

interface StageTimelineProps {
  onRefresh: () => Promise<unknown>;
  positionId: string;
  stages: ProcessStage[];
}

type StageNodeState = 'actual' | 'expected' | 'empty';

function getNodeState(stage: ProcessStage): StageNodeState {
  if (stage.actualDate) return 'actual';
  if (stage.expectedDate) return 'expected';
  return 'empty';
}

export function StageTimeline({ onRefresh, positionId, stages }: StageTimelineProps) {
  const toast = useToast();
  const [editing, setEditing] = useState<ProcessStage | 'new' | null>(null);
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

  const removeStage = async (stageId: string) => {
    try {
      await window.jobSearch.positions.removeStage(positionId, stageId);
      await onRefresh();
      setEditing(null);
      toast.success('流程节点已删除');
    } catch {
      toast.error('删除流程节点失败，请稍后重试');
      throw new Error('stage removal failed');
    }
  };

  return (
    <section className="process-panel" aria-labelledby="process-title">
      <header className="process-panel__header">
        <div>
          <h3 id="process-title">推进记录</h3>
          <p>点击节点编辑日期、反馈、备注或显示顺序。</p>
        </div>
      </header>

      <ol className="stage-flow" data-layout="wrapped-horizontal">
        {sortedStages.map((stage, index) => {
          const state = getNodeState(stage);
          const date = stage.actualDate ?? stage.expectedDate;
          return (
            <li className="stage-flow__item" key={stage.id}>
              <button
                aria-label={`编辑流程阶段：${stage.name}`}
                className={`stage-node stage-node--${state}`}
                data-state={state}
                onClick={() => setEditing({ ...stage, orderIndex: index })}
                type="button"
              >
                <span className="stage-node__dot" aria-hidden="true" />
                <strong className="stage-node__name">{stage.name}</strong>
                <span className="stage-node__date">
                  {date
                    ? `${state === 'actual' ? '实际' : '预计'} ${date}`
                    : '日期未记录'}
                </span>
              </button>
            </li>
          );
        })}
        <li className="stage-flow__item stage-flow__item--add">
          <button
            aria-label="新增流程阶段"
            className="stage-node stage-node--add"
            data-state="add"
            onClick={() => setEditing('new')}
            type="button"
          >
            <span className="stage-node__dot stage-node__dot--add" aria-hidden="true">＋</span>
            <strong className="stage-node__name">新增阶段</strong>
            <span className="stage-node__date">添加到当前岗位</span>
          </button>
        </li>
      </ol>

      <StageEditor
        initialValue={editing && editing !== 'new' ? editing : undefined}
        onClose={() => setEditing(null)}
        onDelete={removeStage}
        onSave={saveStage}
        open={editing !== null}
        positionId={positionId}
        stageCount={sortedStages.length}
      />
    </section>
  );
}
