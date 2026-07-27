import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type {
  Capability,
  Insight,
  InsightInput,
  PositionListItem,
  Project,
  Question,
} from '../../../shared/domain';
import { insightPayloadSchema } from '../../../shared/schemas';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { ResourceView } from '../assets/ResourceView';

interface InsightOptions {
  positions: PositionListItem[];
  projects: Project[];
  questions: Question[];
  capabilities: Capability[];
}

interface InsightEditorProps extends InsightOptions {
  initialValue?: InsightInput;
  onClose: () => void;
  onSave: (input: InsightInput) => Promise<void>;
  open: boolean;
}

const emptyInsight: InsightInput = {
  title: '',
  content: '',
  positionId: null,
  projectId: null,
  questionId: null,
  capabilityId: null,
};

function InsightEditor({
  capabilities,
  initialValue,
  onClose,
  onSave,
  open,
  positions,
  projects,
  questions,
}: InsightEditorProps) {
  const [value, setValue] = useState<InsightInput>(initialValue ?? emptyInsight);
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue ?? emptyInsight);
    setErrors({});
    setSaving(false);
  }, [initialValue, open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const parsed = insightPayloadSchema.safeParse(value);
    if (!parsed.success) {
      setErrors({
        title: value.title.trim() ? undefined : '请输入标题',
        content: value.content.trim() ? undefined : '请输入自由文本',
      });
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch {
      // Parent reports safe feedback and this editor preserves the draft.
    } finally {
      setSaving(false);
    }
  };

  const choose = (
    key: 'positionId' | 'projectId' | 'questionId' | 'capabilityId',
    raw: string,
  ) => {
    setValue((current) => ({ ...current, [key]: raw || null }));
  };

  return (
    <Modal
      footer={(
        <>
          <button className="button button--quiet" disabled={saving} onClick={onClose} type="button">取消</button>
          <button className="button button--primary" disabled={saving} form="insight-editor-form" type="submit">
            {saving ? '保存中…' : '保存心得'}
          </button>
        </>
      )}
      onClose={() => {
        if (!saving) onClose();
      }}
      open={open}
      title={initialValue ? '编辑心得' : '新增心得'}
    >
      <form className="editor-form" id="insight-editor-form" noValidate onSubmit={submit}>
        <Field error={errors.title} label="标题" required>
          <input
            maxLength={200}
            onChange={(event) => {
              setValue((current) => ({ ...current, title: event.target.value }));
              setErrors((current) => ({ ...current, title: undefined }));
            }}
            value={value.title}
          />
        </Field>
        <Field error={errors.content} hint="记录当下的观察、判断或表达心得。" label="自由文本" required>
          <textarea
            maxLength={40_000}
            onChange={(event) => {
              setValue((current) => ({ ...current, content: event.target.value }));
              setErrors((current) => ({ ...current, content: undefined }));
            }}
            rows={10}
            value={value.content}
          />
        </Field>
        <div className="editor-form__grid">
          <Field label="关联岗位（可选）">
            <select onChange={(event) => choose('positionId', event.target.value)} value={value.positionId ?? ''}>
              <option value="">不关联</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>{position.company} · {position.title}</option>
              ))}
            </select>
          </Field>
          <Field label="关联项目（可选）">
            <select onChange={(event) => choose('projectId', event.target.value)} value={value.projectId ?? ''}>
              <option value="">不关联</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </Field>
          <Field label="关联问题（可选）">
            <select onChange={(event) => choose('questionId', event.target.value)} value={value.questionId ?? ''}>
              <option value="">不关联</option>
              {questions.map((question) => <option key={question.id} value={question.id}>{question.text}</option>)}
            </select>
          </Field>
          <Field label="关联能力（可选）">
            <select onChange={(event) => choose('capabilityId', event.target.value)} value={value.capabilityId ?? ''}>
              <option value="">不关联</option>
              {capabilities.map((capability) => <option key={capability.id} value={capability.id}>{capability.name}</option>)}
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export function InsightsPage() {
  const toast = useToast();
  const [editing, setEditing] = useState<Insight | null | undefined>(undefined);
  const resource = useAsyncResource(async () => {
    const [insights, positions, projects, questions, capabilities] = await Promise.all([
      window.jobSearch.assets.insights.list(),
      window.jobSearch.positions.list(),
      window.jobSearch.assets.projects.list(),
      window.jobSearch.assets.questions.list(),
      window.jobSearch.assets.capabilities.list(),
    ]);
    return { insights, positions, projects, questions, capabilities };
  });
  const data = resource.data ?? {
    insights: [],
    positions: [],
    projects: [],
    questions: [],
    capabilities: [],
  };

  const labels = useMemo(() => ({
    positions: new Map(data.positions.map((item) => [item.id, `${item.company} · ${item.title}`])),
    projects: new Map(data.projects.map((item) => [item.id, item.name])),
    questions: new Map(data.questions.map((item) => [item.id, item.text])),
    capabilities: new Map(data.capabilities.map((item) => [item.id, item.name])),
  }), [data.capabilities, data.positions, data.projects, data.questions]);

  const save = async (input: InsightInput) => {
    try {
      await window.jobSearch.assets.insights.save({
        ...input,
        ...(editing ? { id: editing.id } : {}),
      });
      setEditing(undefined);
      await resource.reload();
      toast.success('心得已保存');
    } catch {
      toast.error('保存心得失败，请稍后重试');
      throw new Error('insight save failed');
    }
  };

  const addButton = (
    <button className="button button--primary" onClick={() => setEditing(null)} type="button">
      新增心得
    </button>
  );

  return (
    <div className="assets-page insights-page">
      <header className="page-heading">
        <div>
          <p className="section-label">MARGIN NOTES / 随想边注</p>
          <h2>先捕捉，再建立关联</h2>
          <p>自由写下当下的判断；岗位、项目、问题与能力关联都可以留空。</p>
        </div>
        {addButton}
      </header>
      <ResourceView
        empty={data.insights.length === 0}
        emptyAction={addButton}
        emptyBody="记录一条面试后的观察、项目表达心得或职业判断。"
        emptyTitle="还没有随想与心得"
        error={resource.error}
        errorTitle="心得载入失败"
        loading={resource.loading}
        loadingLabel="正在读取心得…"
      >
        <section aria-label="随想与心得" className="insight-list">
          {data.insights.map((insight, index) => (
            <article className="insight-card" key={insight.id}>
              <div className="insight-card__folio" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div>
                <p className="asset-card__index">{insight.updatedAt.slice(0, 10)}</p>
                <h3 className="user-text">{insight.title}</h3>
                <p className="insight-card__content user-text">{insight.content}</p>
                <div className="relation-chips" aria-label="关联资产">
                  {insight.positionId ? <span>岗位 · {labels.positions.get(insight.positionId) ?? '已失效关联'}</span> : null}
                  {insight.projectId ? <span>项目 · {labels.projects.get(insight.projectId) ?? '已失效关联'}</span> : null}
                  {insight.questionId ? <span>问题 · {labels.questions.get(insight.questionId) ?? '已失效关联'}</span> : null}
                  {insight.capabilityId ? <span>能力 · {labels.capabilities.get(insight.capabilityId) ?? '已失效关联'}</span> : null}
                </div>
              </div>
              <button
                aria-label={`编辑心得 ${insight.title}`}
                className="text-button"
                onClick={() => setEditing(insight)}
                type="button"
              >
                编辑
              </button>
            </article>
          ))}
        </section>
      </ResourceView>
      <InsightEditor
        capabilities={data.capabilities}
        initialValue={editing ?? undefined}
        onClose={() => setEditing(undefined)}
        onSave={save}
        open={editing !== undefined}
        positions={data.positions}
        projects={data.projects}
        questions={data.questions}
      />
    </div>
  );
}
