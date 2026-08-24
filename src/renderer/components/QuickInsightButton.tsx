import { type FormEvent, useEffect, useState } from 'react';
import type { InsightInput } from '../../shared/domain';
import { insightPayloadSchema } from '../../shared/schemas';
import { Field } from './Field';
import { Modal } from './Modal';
import { useToast } from '../hooks/useToast';

function localDate() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function fallbackTitle() {
  return `随想 ${localDate()}`;
}

function titleFromContent(content: string) {
  return content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? fallbackTitle();
}

export function QuickInsightButton() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContent('');
    setError('');
    setSaving(false);
  }, [open]);

  const close = () => {
    if (!saving) setOpen(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const input: InsightInput = {
      title: titleFromContent(content),
      content,
      positionId: null,
      projectId: null,
      questionId: null,
      capabilityId: null,
    };
    const parsed = insightPayloadSchema.safeParse(input);
    if (!parsed.success) {
      setError('请输入正文');
      return;
    }
    setSaving(true);
    try {
      await window.jobSearch.assets.insights.save(parsed.data);
      toast.success('心得已保存');
      setOpen(false);
    } catch {
      setError('保存心得失败，请稍后重试');
      toast.error('保存心得失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        aria-label="快速记录心得"
        className="quick-insight-button"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span aria-hidden="true">✎</span>
        <span className="quick-insight-button__label" aria-hidden="true">心得</span>
      </button>
      <Modal
        closeDisabled={saving}
        footer={(
          <>
            <button className="button button--quiet" disabled={saving} onClick={close} type="button">
              取消
            </button>
            <button className="button button--primary" disabled={saving} form="quick-insight-form" type="submit">
              {saving ? '保存中…' : '保存心得'}
            </button>
          </>
        )}
        onClose={close}
        open={open}
        title="快速记录心得"
      >
        <form className="editor-form" id="quick-insight-form" noValidate onSubmit={submit}>
          <Field error={error} hint="标题会取正文第一行；留空时使用当天日期。" label="正文" required>
            <textarea
              autoFocus
              maxLength={40_000}
              onChange={(event) => {
                setContent(event.target.value);
                setError('');
              }}
              rows={10}
              value={content}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
