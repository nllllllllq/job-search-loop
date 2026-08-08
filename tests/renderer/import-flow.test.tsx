import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PositionIntakePanel } from '../../src/renderer/features/positions/PositionIntakePanel';
import { ProjectImportWizard } from '../../src/renderer/features/projects/ProjectImportWizard';
import { installJobSearchFake } from '../helpers/bridge';
import type { ProjectSegmentPreview } from '../../src/shared/domain';

const project = (tempId: string, name: string): ProjectSegmentPreview & {
  suggested: ProjectSegmentPreview['suggested'] & { unclassifiedNotes: string };
} => ({
  tempId,
  name,
  sourceText: `# ${name}`,
  boundaries: { startLine: 1, endLine: 1 },
  fields: Object.fromEntries([
    'name', 'background', 'goal', 'role', 'keyDecisions', 'outcome', 'evidence',
    'reflections', 'storytellingVersions', 'unclassifiedNotes',
  ].map((key) => [key, {
    value: key === 'name' ? name : '',
    provenance: key === 'name' ? 'source' : 'ai-suggestion',
    evidence: key === 'name' ? `# ${name}` : '',
  }])) as ProjectSegmentPreview['fields'],
  missingFields: ['background', 'goal', 'role', 'keyDecisions', 'outcome', 'evidence', 'reflections', 'storytellingVersions'],
  unusedContent: [],
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
  it('offers only manual, pasted text and screenshot position intake', () => {
    installJobSearchFake();
    render(<PositionIntakePanel onClose={vi.fn()} onSave={vi.fn()} open />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '手动录入',
      '粘贴文本',
      '截图识别',
    ]);
  });

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
    fireEvent.click(screen.getByRole('button', { name: '确认录入岗位' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      company: '远山科技',
      title: 'AI 产品经理',
      interest: 3,
    })));
    expect(fake.positions.create).not.toHaveBeenCalled();
  });

  it('requires an explicit text fallback when image input is unsupported', async () => {
    const fake = installJobSearchFake();
    fake.imports.previewPositionFromImages
      .mockRejectedValueOnce({ code: 'AI_INPUT_UNSUPPORTED' })
      .mockResolvedValueOnce({
        sessionId: '11111111-1111-4111-8111-111111111111',
        sourceSummary: '1 张截图，已由本地 OCR 提取并由 AI 结构化',
        suggested: {
          company: '远山科技', title: 'AI 产品经理', location: '上海', interest: 3, rawJd: '岗位职责',
        },
        confidence: { company: 0.8, title: 0.8, location: 0.7, rawJd: 0.8 },
        warnings: [],
      });
    render(<PositionIntakePanel onClose={vi.fn()} onSave={vi.fn()} open />);
    const file = new File(['image'], 'job.png', { type: 'image/png' });
    fireEvent.click(screen.getByRole('tab', { name: '截图识别' }));
    fireEvent.change(screen.getByLabelText('选择岗位截图'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '开始 AI 识别' }));

    expect(await screen.findByText('当前模型不支持直接读取图片，可以改用本地 OCR 提取文字后再由 AI 整理。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用本地 OCR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '使用本地 OCR' }));
    await waitFor(() => expect(fake.imports.previewPositionFromImages).toHaveBeenLastCalledWith(
      expect.any(Array),
      'ocr-text',
    ));
  });

  it('retries only unsaved projects after a partial batch failure', async () => {
    const fake = installJobSearchFake();
    fake.imports.previewProjectsFromDocument.mockResolvedValue({
      sessionId: '22222222-2222-4222-8222-222222222222',
      sourceSummary: 'notes.md · 2 个候选项目',
      analysisMode: 'ai',
      classification: 'valid-project',
      explanation: '识别到两个项目。',
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
    expect(screen.getByText(/提取后的纯文本/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI 辅助解析' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '仅本地解析' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AI 辅助解析' }));
    expect(await screen.findByDisplayValue('项目一')).toBeInTheDocument();
    expect(fake.imports.previewProjectsFromDocument).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'notes.md' }),
      'ai',
    );
    expect(screen.getByText('AI 已完成项目识别与字段预填')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '进入字段确认' }));
    fireEvent.click(screen.getByRole('button', { name: '保存 2 个项目' }));

    expect(await screen.findByText('项目二保存失败，可重试未保存项目')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试 1 个项目' }));
    await waitFor(() => expect(fake.assets.projects.save).toHaveBeenCalledTimes(3));
    expect(fake.assets.projects.save.mock.calls.map(([input]) => input.name))
      .toEqual(['项目一', '项目二', '项目二']);
  });

  it('provides an individual accept control for an AI suggestion with evidence', async () => {
    const fake = installJobSearchFake();
    const segment = project('33333333-3333-4333-8333-333333333333', '项目一');
    segment.fields.background = {
      value: 'AI contextual suggestion',
      provenance: 'ai-suggestion',
      evidence: 'L1: # 项目一',
    };
    segment.suggested.background = 'AI contextual suggestion';
    fake.imports.previewProjectsFromDocument.mockResolvedValue({
      sessionId: '22222222-2222-4222-8222-222222222222',
      sourceSummary: 'notes.md',
      analysisMode: 'ai',
      classification: 'valid-project',
      explanation: '识别到一个项目。',
      segments: [segment],
      warnings: [],
    });

    render(<ProjectImportWizard onClose={vi.fn()} onCompleted={vi.fn()} open />);
    fireEvent.change(screen.getByLabelText('选择项目文件'), {
      target: { files: [new File(['# 项目一'], 'notes.md', { type: 'text/markdown' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'AI 辅助解析' }));
    expect(await screen.findByDisplayValue('项目一')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '进入字段确认' }));

    expect(screen.getAllByRole('button', { name: '接受建议' })).toHaveLength(9);
  });

  it('restores an AI rewrite to its evidence text instead of retaining the rewrite', async () => {
    const fake = installJobSearchFake();
    const segment = project('33333333-3333-4333-8333-333333333333', '项目一');
    segment.fields.role = {
      value: 'AI polished role summary',
      provenance: 'ai-rewrite',
      evidence: 'L1: 负责需求梳理与方案推进',
    };
    segment.suggested.role = 'AI polished role summary';
    fake.imports.previewProjectsFromDocument.mockResolvedValue({
      sessionId: '22222222-2222-4222-8222-222222222222',
      sourceSummary: 'notes.md',
      analysisMode: 'ai',
      classification: 'valid-project',
      explanation: 'identified one project',
      segments: [segment],
      warnings: [],
    });

    render(<ProjectImportWizard onClose={vi.fn()} onCompleted={vi.fn()} open />);
    fireEvent.change(screen.getByLabelText(/选择项目文件/), {
      target: { files: [new File(['# 项目一'], 'notes.md', { type: 'text/markdown' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /AI 辅助解析/ }));
    expect(await screen.findByDisplayValue('项目一')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /进入字段确认/ }));

    fireEvent.click(screen.getAllByRole('button', { name: /还原建议/ })[3]!);

    expect(screen.getByDisplayValue('负责需求梳理与方案推进')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('AI polished role summary')).not.toBeInTheDocument();
  });

  it('omits an AI suggestion from the save payload until it is individually accepted', async () => {
    const fake = installJobSearchFake();
    const segment = project('33333333-3333-4333-8333-333333333333', '项目一');
    segment.fields.background = {
      value: 'AI contextual suggestion',
      provenance: 'ai-suggestion',
      evidence: 'L1: # 项目一',
    };
    segment.suggested.background = 'AI contextual suggestion';
    fake.assets.projects.save
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce({ id: 'project-id', ...segment.suggested, createdAt: '', updatedAt: '' });
    fake.imports.previewProjectsFromDocument.mockResolvedValue({
      sessionId: '22222222-2222-4222-8222-222222222222',
      sourceSummary: 'notes.md',
      analysisMode: 'ai',
      classification: 'valid-project',
      explanation: 'identified one project',
      segments: [segment],
      warnings: [],
    });

    render(<ProjectImportWizard onClose={vi.fn()} onCompleted={vi.fn()} open />);
    fireEvent.change(screen.getByLabelText(/选择项目文件/), {
      target: { files: [new File(['# 项目一'], 'notes.md', { type: 'text/markdown' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /AI 辅助解析/ }));
    expect(await screen.findByDisplayValue('项目一')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /进入字段确认/ }));

    fireEvent.click(screen.getByRole('button', { name: /保存 1 个项目/ }));
    await waitFor(() => expect(fake.assets.projects.save).toHaveBeenCalledTimes(1));
    expect(fake.assets.projects.save).toHaveBeenLastCalledWith(expect.objectContaining({ background: '' }));

    fireEvent.click(screen.getAllByRole('button', { name: /接受建议/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: /保存 1 个项目/ }));
    await waitFor(() => expect(fake.assets.projects.save).toHaveBeenCalledTimes(2));
    expect(fake.assets.projects.save).toHaveBeenLastCalledWith(expect.objectContaining({
      background: 'AI contextual suggestion',
    }));
  });

  it('shows a no-project explanation without a save path', async () => {
    const fake = installJobSearchFake();
    fake.imports.previewProjectsFromDocument.mockResolvedValue({
      sessionId: '55555555-5555-4555-8555-555555555555',
      sourceSummary: 'meeting.md',
      analysisMode: 'ai',
      classification: 'no-valid-project',
      explanation: '内容是会议纪要，未提供可区分的项目经历。',
      segments: [],
      warnings: [],
    });

    render(<ProjectImportWizard onClose={vi.fn()} onCompleted={vi.fn()} open />);
    fireEvent.change(screen.getByLabelText('选择项目文件'), {
      target: { files: [new File(['notes'], 'meeting.md', { type: 'text/markdown' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'AI 辅助解析' }));

    expect(await screen.findByText('未识别到可保存的项目')).toBeInTheDocument();
    expect(screen.getByText('内容是会议纪要，未提供可区分的项目经历。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /进入字段确认|保存/ })).not.toBeInTheDocument();
    expect(fake.assets.projects.save).not.toHaveBeenCalled();
  });
});
