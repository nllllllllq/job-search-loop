import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '../../src/renderer/components/EmptyState';
import {
  Field,
  type NativeFieldControl,
} from '../../src/renderer/components/Field';
import { StatusBadge } from '../../src/renderer/components/StatusBadge';

describe('shared UI primitives', () => {
  it('associates field labels, hints, and errors with the control', () => {
    render(
      <Field label="公司名称" hint="使用公司常用简称" error="请填写公司名称" required>
        <input />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: /公司名称/ });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('使用公司常用简称 请填写公司名称');
  });

  it('rejects custom controls instead of silently cloning them', () => {
    function CustomInput() {
      return <input />;
    }
    const customControl = <CustomInput /> as unknown as NativeFieldControl;

    expect(() =>
      render(<Field label="公司名称">{customControl}</Field>),
    ).toThrow(
      'Field only accepts a native input, textarea, or select element.',
    );
  });

  it('renders canonical stage labels with semantic status', () => {
    const { rerender } = render(<StatusBadge stage="interview" />);

    expect(screen.getByText('面试中')).toHaveAttribute('data-tone', 'primary');

    rerender(<StatusBadge stage="applied" />);
    expect(screen.getByText('已投递')).toHaveAttribute('data-tone', 'primary');

    rerender(<StatusBadge stage="rejected" />);
    expect(screen.getByText('未通过')).toHaveAttribute('data-tone', 'danger');
  });

  it('labels an absent stage as unconfigured', () => {
    render(<StatusBadge />);

    expect(screen.getByText('未设置')).toHaveAttribute('data-tone', 'neutral');
  });

  it('gives contextual empty content a labelled region', () => {
    render(
      <EmptyState title="还没有岗位记录" body="添加目标岗位后，在这里跟踪进度。">
        <button type="button">添加岗位</button>
      </EmptyState>,
    );

    expect(screen.getByRole('region', { name: '还没有岗位记录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加岗位' })).toBeInTheDocument();
  });
});
