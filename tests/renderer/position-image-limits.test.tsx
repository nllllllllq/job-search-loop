import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PositionIntakePanel } from '../../src/renderer/features/positions/PositionIntakePanel';
import { installJobSearchFake } from '../helpers/bridge';

describe('position image input limits', () => {
  it('stops unsupported screenshot files in the renderer with the exact limit message', async () => {
    const fake = installJobSearchFake();
    render(<PositionIntakePanel onClose={vi.fn()} onSave={vi.fn()} open />);

    fireEvent.click(screen.getByRole('tab', { name: '截图识别' }));
    fireEvent.change(screen.getByLabelText('选择岗位截图'), {
      target: { files: [new File(['image'], 'job.gif', { type: 'image/gif' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始 AI 识别' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Only PNG and JPEG images are supported.');
    expect(fake.imports.previewPositionFromImages).not.toHaveBeenCalled();
  });
});
