import { useMemo, useState } from 'react';
import type { Interview, ProcessStage, ProcessStageInput } from '../../../shared/domain';
import { stageDatePolicy } from '../../../shared/stage-policy';
import { Modal } from '../../components/Modal';
import { useToast } from '../../hooks/useToast';
import { StageEditor } from './StageEditor';

interface StageTimelineProps {
  onRefresh: () => Promise<unknown>;
  positionId: string;
  stages: ProcessStage[];
  interviews: Interview[];
}

type StageNodeState = 'actual' | 'expected' | 'empty';
function getNodeState(stage: ProcessStage): StageNodeState {
  if (stage.actualDate) return 'actual';
  if (stage.expectedDate) return 'expected';
  return 'empty';
}

export function StageTimeline({ onRefresh, positionId, stages, interviews }: StageTimelineProps) {
  const toast = useToast();
  const [editing, setEditing] = useState<ProcessStage | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ProcessStage | null>(null);
  const [removing, setRemoving] = useState(false);
  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.orderIndex - b.orderIndex), [stages]);

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

  const openDeleteConfirmation = (stage: ProcessStage) => {
    setDeleting(stage);
  };

  const openEditor = (stage: ProcessStage | 'new') => {
    setEditing(stage);
  };

  const removeStage = async () => {
    if (!deleting || removing) return;
    setRemoving(true);
    try {
      await window.jobSearch.positions.removeStage(positionId, deleting.id);
      await onRefresh();
      setDeleting(null);
      toast.success('流程节点已删除');
    } catch {
      toast.error('删除流程节点失败，请稍后重试');
    } finally {
      setRemoving(false);
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
          const policy = stageDatePolicy(stage.canonicalStage);
          const accessibleStatus = policy.kind === 'notice-and-event'
            ? (!stage.expectedDate && !stage.actualDate ? '未记录日期' : [
              stage.expectedDate ? `${policy.expectedLabel} ${stage.expectedDate}` : null,
              stage.actualDate
                ? `${policy.actualLabel} ${stage.actualDate}`
                : `尚未记录${policy.actualLabel}`,
            ].filter(Boolean).join('，'))
            : stage.actualDate ? `${policy.actualLabel} ${stage.actualDate}` : '未记录日期';
          const dateText = date
            ? `${stage.actualDate ? policy.actualLabel : policy.kind === 'notice-and-event' ? '通知' : policy.actualLabel} ${date}`
            : '日期未记录';
          return (
            <li className="stage-flow__item" key={stage.id}>
              <button
                aria-label={`编辑流程阶段：${stage.name}，${accessibleStatus}`}
                className={`stage-node stage-node--${state}`}
                data-state={state}
                onClick={() => openEditor({ ...stage, orderIndex: index })}
                type="button"
              >
                <span className="stage-node__dot" aria-hidden="true" />
                <strong className="stage-node__name">{stage.name}</strong>
                <span className="stage-node__date">{dateText}</span>
              </button>
              <button
                aria-label={`删除流程阶段：${stage.name}`}
                className="stage-node__delete"
                onClick={() => openDeleteConfirmation(stage)}
                type="button"
              >
                ×
              </button>
            </li>
          );
        })}
        <li className="stage-flow__item stage-flow__item--add">
          <button aria-label="新增流程阶段" className="stage-node stage-node--add" data-state="add" onClick={() => openEditor('new')} type="button">
            <span className="stage-node__dot stage-node__dot--add" aria-hidden="true">＋</span>
            <strong className="stage-node__name">新增阶段</strong>
            <span className="stage-node__date">添加到当前岗位</span>
          </button>
        </li>
      </ol>

      <StageEditor
        initialValue={editing && editing !== 'new' ? editing : undefined}
        onClose={() => setEditing(null)}
        onSave={saveStage}
        open={editing !== null}
        interviews={interviews}
        positionId={positionId}
        stageCount={sortedStages.length}
      />

      <Modal
        closeDisabled={removing}
        footer={(
          <>
            <button className="button button--quiet" disabled={removing} onClick={() => setDeleting(null)} type="button">取消</button>
            <button className="button button--danger" disabled={removing} onClick={() => void removeStage()} type="button">
              {removing ? '删除中…' : '确认删除节点'}
            </button>
          </>
        )}
        onClose={() => {
          if (!removing) setDeleting(null);
        }}
        open={deleting !== null}
        title="确认删除节点"
      >
        <div className="stage-delete-confirmation" role="alert">
          <strong>永久删除“{deleting?.name}”节点？</strong>
          <p>该节点的日期、反馈和备注会一起删除，此操作无法撤销。</p>
        </div>
      </Modal>
    </section>
  );
}
