import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PositionIntakePanel } from '../../src/renderer/features/positions/PositionIntakePanel';
import { ProjectImportWizard } from '../../src/renderer/features/projects/ProjectImportWizard';
import { installJobSearchFake } from '../helpers/bridge';

const project = (tempId: string, name: string) => ({
  tempId,
  name,
  sourceText: `# ${name}`,
  warnings: [],
  suggested: {
    name,
    background: '',
    goal: '',
    role: '',
    keyDecisions: '',
    outcome: '',
    evidence: '',
    reflections: '',
    storytellingVersions: '',
    unclassifiedNotes: '',
  },
});

describe('local import UI', () => {
  it('previews pasted JD text and saves only after user confirmation', async () => {
    const fake = installJobSearchFake();
    fake.imports.previewPositionFromText.mockResolvedValue({
      sessionId: '11111111-1111-4111-8111-111111111111',
      sourceSummary: '5 行文本',
      suggested: {
        company: '远山科技',
        title: 'AI 产品经理',
        location: '上海',
        interest: 3,
        rawJd: '公司：远山科技\n岗位：AI 产品经理\n地点：上海\n岗位职责：产品规划',
      },
      confidence: { company: 0.95, title: 0.95, location: 0.95, rawJd: 0.9 },
      warnings: [],
    });
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<PositionIntakePanel onClose={vi.fn()} onSave={onSave} open />);
    fireEvent.click(screen.getByRole('tab', { name: '粘贴文本' }));
    fireEvent.change(screen.getByLabelText('粘贴岗位文本'), {
      target: { value: '公司：远山科技\n岗位：AI 产品经理' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析文本' }));

    expect(await screen.findByDisplayValue('远山科技')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存岗位' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      company: '远山科技',
      title: 'AI 产品经理',
      interest: 3,
    })));
    expect(fake.positions.create).not.toHaveBeenCalled();
  });

  it('retries only unsaved projects after a partial batch failure', async () => {
    const fake = installJobSearchFake();
    fake.imports.previewProjectsFromDocument.mockResolvedValue({
      sessionId: '22222222-2222-4222-8222-222222222222',
      sourceSummary: 'notes.md · 2 个候选项目',
      segments: [
        project('33333333-3333-4333-8333-333333333333', '项目一'),
        project('44444444-4444-4444-8444-444444444444', '项目二'),
      ],
      warnings: [],
    });
    fake.assets.projects.save
      .mockResolvedValueOnce({ id: 'a', ...project('x', '项目一').suggested, createdAt: '', updatedAt: '' })
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce({ id: 'b', ...project('x', '项目二').suggested, createdAt: '', updatedAt: '' });

    render(<ProjectImportWizard onClose={vi.fn()} onCompleted={vi.fn()} open />);
    const file = new File(['# 项目一'], 'notes.md', { type: 'text/markdown' });
    fireEvent.change(screen.getByLabelText('选择项目文件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '解析文件' }));
    expect(await screen.findByDisplayValue('项目一')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '进入字段确认' }));
    fireEvent.click(screen.getByRole('button', { name: '保存 2 个项目' }));

    expect(await screen.findByText('项目二保存失败，可重试未保存项目')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试 1 个项目' }));
    await waitFor(() => expect(fake.assets.projects.save).toHaveBeenCalledTimes(3));
    expect(fake.assets.projects.save.mock.calls.map(([input]) => input.name))
      .toEqual(['项目一', '项目二', '项目二']);
  });
});
