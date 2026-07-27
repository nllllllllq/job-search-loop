import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import type { Question, QuestionInput, QuestionType } from '../../../shared/domain';
import { EmptyState } from '../../components/EmptyState';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { ResourceView } from '../assets/ResourceView';
import { QuestionEditor } from './QuestionEditor';

const labels: Record<QuestionType, {
  tab: string;
  add: string;
  empty: string;
}> = {
  interviewer: {
    tab: '面试官问题',
    add: '新增面试官问题',
    empty: '还没有面试官问题',
  },
  candidate: {
    tab: '候选人反问',
    add: '新增候选人反问',
    empty: '还没有候选人反问',
  },
};

export function QuestionsPage() {
  const types: QuestionType[] = ['interviewer', 'candidate'];
  const [type, setType] = useState<QuestionType>('interviewer');
  const [editing, setEditing] = useState<Question | null | undefined>(undefined);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const toast = useToast();
  const resource = useAsyncResource(
    () => Promise.all([
      window.jobSearch.assets.questions.list(type),
      window.jobSearch.assets.projects.list(),
      window.jobSearch.assets.capabilities.list(),
    ]),
    [type],
  );
  const [questions, projects, capabilities] = resource.data ?? [[], [], []];
  const activeLabel = labels[type];

  const byProject = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const byCapability = useMemo(
    () => new Map(capabilities.map((capability) => [capability.id, capability.name])),
    [capabilities],
  );

  const selectType = (next: QuestionType) => {
    if (next === type) return;
    setEditing(undefined);
    setType(next);
  };

  const navigateTabs = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % types.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + types.length) % types.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = types.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectType(types[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };

  const save = async (input: QuestionInput) => {
    try {
      await window.jobSearch.assets.questions.save({
        ...input,
        ...(editing ? { id: editing.id } : {}),
      });
      setEditing(undefined);
      await resource.reload();
      toast.success('问题已保存');
    } catch {
      toast.error('保存问题失败，请稍后重试');
      throw new Error('question save failed');
    }
  };

  const addButton = (
    <button className="button button--primary" onClick={() => setEditing(null)} type="button">
      {activeLabel.add}
    </button>
  );

  return (
    <div className="assets-page questions-page">
      <header className="page-heading">
        <div>
          <p className="section-label">QUESTION LEDGER / 问题账本</p>
          <h2>把提问与反问分开练习</h2>
          <p>两个题库互不混排：一边准备回答，一边保留你要判断团队的问题。</p>
        </div>
        {addButton}
      </header>

      <div aria-label="问题类型" className="library-tabs" role="tablist">
        {types.map((item, index) => (
          <button
            aria-controls="question-library-panel"
            aria-selected={type === item}
            className="library-tab"
            key={item}
            onClick={() => selectType(item)}
            onKeyDown={(event) => navigateTabs(event, index)}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            tabIndex={type === item ? 0 : -1}
            type="button"
          >
            {labels[item].tab}
          </button>
        ))}
      </div>

      <div aria-live="polite" id="question-library-panel" role="tabpanel">
        <ResourceView
          empty={questions.length === 0}
          emptyAction={addButton}
          emptyBody={type === 'interviewer'
            ? '记录一次真实出现的问题，并逐步补充回答证据。'
            : '记录你想向面试官确认的团队、目标与协作问题。'}
          emptyTitle={activeLabel.empty}
          error={resource.error}
          errorTitle="问题库载入失败"
          loading={resource.loading}
          loadingLabel="正在读取问题库…"
        >
          <section aria-label={activeLabel.tab} className="question-list">
            {questions.map((question) => (
              <article className="question-card" key={question.id}>
                <div className="question-card__meta">
                  <span>出现 {question.occurrenceCount} 次</span>
                  <button
                    aria-label={`编辑问题 ${question.text}`}
                    className="text-button"
                    onClick={() => setEditing(question)}
                    type="button"
                  >
                    编辑
                  </button>
                </div>
                <h3>{question.text}</h3>
                <p>{question.answerDraft || '尚未记录回答草稿'}</p>
                <div className="relation-chips" aria-label="关联资产">
                  {question.projectIds.map((id) => (
                    <span key={id}>项目 · {byProject.get(id) ?? '已失效关联'}</span>
                  ))}
                  {question.capabilityIds.map((id) => (
                    <span key={id}>能力 · {byCapability.get(id) ?? '已失效关联'}</span>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </ResourceView>
      </div>

      <QuestionEditor
        capabilities={capabilities}
        initialValue={editing ?? undefined}
        onClose={() => setEditing(undefined)}
        onSave={save}
        open={editing !== undefined}
        projects={projects}
        type={type}
      />
      {!resource.loading && !resource.error && questions.length > 0 && projects.length === 0 && capabilities.length === 0 ? (
        <EmptyState
          body="项目和能力会在创建后出现在问题编辑器的可选关联中。"
          icon="链"
          title="当前问题尚无可关联资产"
        />
      ) : null}
    </div>
  );
}
