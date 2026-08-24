import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReviewToProjectEditor } from '../../src/renderer/features/projects/ReviewToProjectEditor';
import { ToastProvider } from '../../src/renderer/hooks/useToast';
import type { Project } from '../../src/shared/domain';
import type { JobSearchApi } from '../../src/shared/ipc';
import { createJobSearchFake, installJobSearchFake } from '../helpers/bridge';

type ProjectSave = JobSearchApi['assets']['projects']['save'];

const reusableItem = {
  targetType: 'project' as const,
  title: '支付流程改造',
  content: '面试中提到，我主导了支付流程改造并验证了关键路径。',
};

const savedProject: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: reusableItem.title,
  projectTime: '',
  background: '',
  goal: '',
  role: '',
  keyDecisions: '',
  outcome: '',
  evidence: '',
  reflections: '',
  storytellingVersions: '',
  unclassifiedNotes: reusableItem.content,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

function renderReviewEditor({
  onClose = vi.fn(),
  onSaved = vi.fn(),
  save = vi.fn<ProjectSave>().mockResolvedValue(savedProject),
}: {
  onClose?: () => void;
  onSaved?: (project: Project) => void;
  save?: ProjectSave;
} = {}) {
  const fake = createJobSearchFake();
  fake.assets.projects.save.mockImplementation(save);
  installJobSearchFake(fake);
  const user = userEvent.setup();
  const view = render(
    <ToastProvider defaultDuration={0}>
      <ReviewToProjectEditor
        item={reusableItem}
        onClose={onClose}
        onSaved={onSaved}
        open
      />
    </ToastProvider>,
  );
  return { ...view, fake, onClose, onSaved, user };
}

describe('ReviewToProjectEditor', () => {
  it('prefills and saves the edited project mapping with empty structured fields', async () => {
    const { fake, user } = renderReviewEditor();
    const dialog = await screen.findByRole('dialog', { name: '纳入项目档案' });

    expect(within(dialog).getByLabelText(/项目名称/)).toHaveValue(reusableItem.title);
    expect(within(dialog).getByLabelText(/项目内容/)).toHaveValue(reusableItem.content);
    expect(within(dialog).getByLabelText(/项目角色/)).toHaveValue('');
    expect(within(dialog).getByLabelText(/项目时间/)).toHaveValue('');

    await user.clear(within(dialog).getByLabelText(/项目名称/));
    await user.type(within(dialog).getByLabelText(/项目名称/), '支付流程改造（确认版）');
    await user.clear(within(dialog).getByLabelText(/项目内容/));
    await user.type(within(dialog).getByLabelText(/项目内容/), '补充确认后的项目原始内容。');
    await user.click(within(dialog).getByRole('button', { name: '确认纳入项目档案' }));

    await waitFor(() => expect(fake.assets.projects.save).toHaveBeenCalledWith({
      name: '支付流程改造（确认版）',
      projectTime: '',
      background: '',
      goal: '',
      role: '',
      keyDecisions: '',
      outcome: '',
      evidence: '',
      reflections: '',
      storytellingVersions: '',
      unclassifiedNotes: '补充确认后的项目原始内容。',
    }));
  });

  it('preserves edits when the same project item is passed as a new object', async () => {
    const { onClose, onSaved, rerender, user } = renderReviewEditor();
    const dialog = await screen.findByRole('dialog', { name: '纳入项目档案' });
    const name = within(dialog).getByLabelText(/项目名称/);
    const content = within(dialog).getByLabelText(/项目内容/);

    await user.clear(name);
    await user.type(name, '用户确认后的项目名称');
    await user.clear(content);
    await user.type(content, '用户确认后的项目内容');

    rerender(
      <ToastProvider defaultDuration={0}>
        <ReviewToProjectEditor
          item={{ ...reusableItem }}
          onClose={onClose}
          onSaved={onSaved}
          open
        />
      </ToastProvider>,
    );

    expect(within(screen.getByRole('dialog', { name: '纳入项目档案' })).getByLabelText(/项目名称/))
      .toHaveValue('用户确认后的项目名称');
    expect(within(screen.getByRole('dialog', { name: '纳入项目档案' })).getByLabelText(/项目内容/))
      .toHaveValue('用户确认后的项目内容');
  });

  it('cancels from the close button without saving', async () => {
    const onClose = vi.fn();
    const { fake, user } = renderReviewEditor({ onClose });
    const dialog = await screen.findByRole('dialog', { name: '纳入项目档案' });

    await user.click(within(dialog).getByRole('button', { name: '关闭对话框' }));

    expect(fake.assets.projects.save).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('waits for save resolution before callbacks and prevents duplicate pending saves', async () => {
    let resolve!: (project: Project) => void;
    const save = vi.fn<ProjectSave>().mockImplementation(() => new Promise<Project>((resolvePromise) => {
      resolve = resolvePromise;
    }));
    const events: string[] = [];
    const { fake, user } = renderReviewEditor({
      onClose: () => events.push('closed'),
      onSaved: () => events.push('saved'),
      save,
    });
    const dialog = await screen.findByRole('dialog', { name: '纳入项目档案' });
    const saveButton = within(dialog).getByRole('button', { name: '确认纳入项目档案' });

    await user.click(saveButton);
    await user.click(saveButton);

    expect(fake.assets.projects.save).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeDisabled();
    expect(events).toEqual([]);
    expect(screen.getByRole('dialog', { name: '纳入项目档案' })).toBeInTheDocument();

    resolve(savedProject);
    await waitFor(() => expect(events).toEqual(['saved', 'closed']));
  });

  it('keeps edited values and shows a safe error when saving fails', async () => {
    const save = vi.fn<ProjectSave>().mockRejectedValue(new Error('SQL secret should not leak'));
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const { user } = renderReviewEditor({ onClose, onSaved, save });
    const dialog = await screen.findByRole('dialog', { name: '纳入项目档案' });
    const name = within(dialog).getByLabelText(/项目名称/);
    const content = within(dialog).getByLabelText(/项目内容/);

    await user.clear(name);
    await user.type(name, '失败后仍保留的名称');
    await user.clear(content);
    await user.type(content, '失败后仍保留的原始内容');
    await user.click(within(dialog).getByRole('button', { name: '确认纳入项目档案' }));

    expect(await screen.findByText('保存项目失败，请稍后重试')).toBeInTheDocument();
    expect(screen.queryByText('SQL secret should not leak')).not.toBeInTheDocument();
    expect(name).toHaveValue('失败后仍保留的名称');
    expect(content).toHaveValue('失败后仍保留的原始内容');
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
