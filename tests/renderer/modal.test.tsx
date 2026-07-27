import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../../src/renderer/components/Modal';

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

  it('requests close once when Escape is pressed', () => {
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
});
