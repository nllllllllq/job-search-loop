import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { ProcessStage, ProcessStageInput } from '../../../shared/domain';
import { ContextMenu } from '../../components/ContextMenu';
import { Modal } from '../../components/Modal';
import { useToast } from '../../hooks/useToast';
import { StageEditor } from './StageEditor';

interface StageTimelineProps {
  onRefresh: () => Promise<unknown>;
  positionId: string;
  stages: ProcessStage[];
}

type StageNodeState = 'actual' | 'expected' | 'empty';
type ContextTarget = { stage: ProcessStage; x: number; y: number };

function getNodeState(stage: ProcessStage): StageNodeState {
  if (stage.actualDate) return 'actual';
  if (stage.expectedDate) return 'expected';
  return 'empty';
}

export function StageTimeline({ onRefresh, positionId, stages }: StageTimelineProps) {
  const toast = useToast();
  const [editing, setEditing] = useState<ProcessStage | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ProcessStage | null>(null);
  const [removing, setRemoving] = useState(false);
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.orderIndex - b.orderIndex), [stages]);

  useEffect(() => {
    if (!contextTarget) return undefined;
    const dismissOnPointerOutside = () => setContextTarget(null);
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextTarget(null);
    };
    document.addEventListener('pointerdown', dismissOnPointerOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOnPointerOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [contextTarget]);

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
    setContextTarget(null);
    setDeleting(stage);
  };

  const openEditor = (stage: ProcessStage | 'new') => {
    setContextTarget(null);
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

  const openContextMenu = (event: MouseEvent<HTMLLIElement>, stage: ProcessStage) => {
    event.preventDefault();
    setContextTarget({ stage, x: event.clientX, y: event.clientY });
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
          const accessibleStatus = stage.actualDate
            ? `已记录实际日期 ${stage.actualDate}`
            : stage.expectedDate ? `仅预计日期 ${stage.expectedDate}` : '未记录日期';
          return (
            <li className="stage-flow__item" key={stage.id} onContextMenu={(event) => openContextMenu(event, stage)}>
              <button
                aria-label={`编辑流程阶段：${stage.name}，${accessibleStatus}`}
                className={`stage-node stage-node--${state}`}
                data-state={state}
                onClick={() => openEditor({ ...stage, orderIndex: index })}
                type="button"
              >
                <span className="stage-node__dot" aria-hidden="true" />
                <strong className="stage-node__name">{stage.name}</strong>
                <span className="stage-node__date">{date ? `${state === 'actual' ? '实际' : '预计'} ${date}` : '日期未记录'}</span>
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

      {contextTarget ? (
        <ContextMenu
          label={`${contextTarget.stage.name}操作`}
          onDelete={() => openDeleteConfirmation(contextTarget.stage)}
          x={contextTarget.x}
          y={contextTarget.y}
        />
      ) : null}

      <StageEditor
        initialValue={editing && editing !== 'new' ? editing : undefined}
        onClose={() => setEditing(null)}
        onSave={saveStage}
        open={editing !== null}
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
