import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../../src/renderer/components/Modal';
import { InterviewEditor } from '../../src/renderer/features/interviews/InterviewEditor';
import { PositionEditor } from '../../src/renderer/features/positions/PositionEditor';
import { PositionIntakePanel } from '../../src/renderer/features/positions/PositionIntakePanel';
import { ProjectEditor } from '../../src/renderer/features/projects/ProjectEditor';
import { QuestionEditor } from '../../src/renderer/features/questions/QuestionEditor';

const closeOnlyEditors = [
  {
    name: 'position intake',
    render: (onClose: () => void) => <PositionIntakePanel onClose={onClose} onSave={async () => undefined} open />,
    title: '录入岗位',
  },
  {
    name: 'position editor',
    render: (onClose: () => void) => <PositionEditor onClose={onClose} onSave={async () => undefined} open />,
    title: '录入岗位',
  },
  {
    name: 'project editor',
    render: (onClose: () => void) => <ProjectEditor onClose={onClose} onSave={async () => undefined} open />,
    title: '新增项目',
  },
  {
    name: 'question editor',
    render: (onClose: () => void) => (
      <QuestionEditor
        capabilities={[]}
        onClose={onClose}
        onSave={async () => undefined}
        open
        projects={[]}
        type="interviewer"
      />
    ),
    title: '新增面试官问题',
  },
  {
    name: 'interview editor',
    render: (onClose: () => void) => (
      <InterviewEditor
        onClose={onClose}
        onSave={async () => undefined}
        open
        positionId="4acdf6d3-9e22-4f0f-9684-0324cb8ecad5"
      />
    ),
    title: '新增面试记录',
  },
];

describe('Modal', () => {
  it('opens with native dialog semantics and an accessible title', () => {
    render(
      <Modal open onClose={() => undefined} title="删除记录？">
        删除后无法恢复。
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: '删除记录？' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByText('删除后无法恢复。')).toBeInTheDocument();
  });

  it('requests close once when Escape is pressed by default', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="编辑岗位">
        表单内容
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: '编辑岗位' });
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('provides an explicit close action', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="编辑岗位">
        表单内容
      </Modal>,
    );

    await user.click(screen.getByRole('button', { name: '关闭对话框' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('notifies the controller when the native dialog closes by default', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="编辑岗位">
        <form method="dialog">
          <button type="submit">完成</button>
        </form>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: '编辑岗位' });
    dialog.removeAttribute('open');
    fireEvent(dialog, new Event('close'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not notify again when a controlled close synchronizes the dialog', () => {
    const onClose = vi.fn();
    const view = render(
      <Modal open onClose={onClose} title="编辑岗位">
        表单内容
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: '编辑岗位' });

    view.rerender(
      <Modal open={false} onClose={onClose} title="编辑岗位">
        表单内容
      </Modal>,
    );
    fireEvent(dialog, new Event('close'));

    expect(dialog).not.toHaveAttribute('open');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('requests close once when the backdrop is clicked by default', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="编辑岗位">
        表单内容
      </Modal>,
    );

    fireEvent.click(screen.getByRole('dialog', { name: '编辑岗位' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(closeOnlyEditors)('uses the close button as the only dismissal for $name', async ({ render: renderEditor, title }) => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(renderEditor(onClose));

    const dialog = screen.getByRole('dialog', { name: title });
    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument();
    fireEvent.click(dialog);
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '关闭对话框' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('restores body overflow only after the final stacked modal closes', () => {
    document.body.style.overflow = 'auto';
    const view = render(
      <>
        <Modal open onClose={() => undefined} title="第一层">
          第一层内容
        </Modal>
        <Modal open onClose={() => undefined} title="第二层">
          第二层内容
        </Modal>
      </>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    view.rerender(
      <>
        <Modal open={false} onClose={() => undefined} title="第一层">
          第一层内容
        </Modal>
        <Modal open onClose={() => undefined} title="第二层">
          第二层内容
        </Modal>
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    view.rerender(
      <>
        <Modal open={false} onClose={() => undefined} title="第一层">
          第一层内容
        </Modal>
        <Modal open={false} onClose={() => undefined} title="第二层">
          第二层内容
        </Modal>
      </>,
    );
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('restores body overflow when an open modal unmounts', () => {
    document.body.style.overflow = 'scroll';
    const view = render(
      <Modal open onClose={() => undefined} title="编辑岗位">
        表单内容
      </Modal>,
    );

    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });
});
