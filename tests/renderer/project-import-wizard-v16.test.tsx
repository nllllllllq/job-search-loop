import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectImportWizard } from '../../src/renderer/features/projects/ProjectImportWizard';
import type { Project, ProjectImportPreview, ProjectSegmentPreview } from '../../src/shared/domain';
import { installJobSearchFake } from '../helpers/bridge';

function segment(): ProjectSegmentPreview {
  const fields = Object.fromEntries([
    ['name', { value: '项目一', provenance: 'source', evidence: 'L1: # 项目一' }],
    ['projectTime', { value: '2024', provenance: 'source', evidence: 'L1: 项目时间：2024' }],
    ['background', { value: '', provenance: 'ai-suggestion', evidence: '' }],
    ['goal', { value: '', provenance: 'ai-suggestion', evidence: '' }],
    ['role', { value: '负责需求梳理', provenance: 'ai-rewrite', evidence: 'L2: 需求梳理与推进' }],
    ['keyDecisions', { value: '', provenance: 'ai-suggestion', evidence: '' }],
    ['outcome', { value: '', provenance: 'ai-suggestion', evidence: '' }],
    ['evidence', { value: '', provenance: 'ai-suggestion', evidence: '' }],
    ['reflections', { value: '', provenance: 'ai-suggestion', evidence: '' }],
    ['storytellingVersions', { value: '', provenance: 'ai-suggestion', evidence: '' }],
    ['unclassifiedNotes', { value: '', provenance: 'ai-suggestion', evidence: '' }],
  ]) as ProjectSegmentPreview['fields'];
  return {
    tempId: '33333333-3333-4333-8333-333333333333',
    name: '项目一',
    sourceText: '# 项目一\n需求梳理与推进',
    suggested: {
      name: '项目一',
      projectTime: '2024',
      background: '',
      goal: '',
      role: '负责需求梳理',
      keyDecisions: '',
      outcome: '',
      evidence: '',
      reflections: '',
      storytellingVersions: '',
      unclassifiedNotes: '',
    },
    boundaries: { startLine: 1, endLine: 2 },
    fields,
    missingFields: ['background', 'goal', 'keyDecisions', 'outcome', 'evidence', 'reflections', 'storytellingVersions'],
    unusedContent: [],
    warnings: [],
  };
}

function existingProject(): Project {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: '原项目名称',
    projectTime: '2020–2022',
    background: '',
    goal: '',
    role: '原项目角色',
    keyDecisions: '',
    outcome: '',
    evidence: '',
    reflections: '',
    storytellingVersions: '',
    unclassifiedNotes: '原始内容\n保留空格与换行。',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
  };
}

function preview(overrides: Partial<ProjectImportPreview> = {}): ProjectImportPreview {
  return {
    sessionId: '22222222-2222-4222-8222-222222222222',
    sourceSummary: '文本',
    analysisMode: 'ai',
    classification: 'valid-project',
    explanation: '识别到一个项目。',
    segments: [segment()],
    warnings: [],
    ...overrides,
  };
}

describe('v1.6 project import wizard', () => {
  it('sends pasted text as an in-memory TXT ImportedFileInput', async () => {
    const fake = installJobSearchFake();
    fake.imports.previewProjectsFromDocument.mockResolvedValue(preview());
    render(<ProjectImportWizard onClose={vi.fn()} onCompleted={vi.fn()} open />);

    fireEvent.change(screen.getByLabelText('粘贴项目文本'), {
      target: { value: '# 项目一\n结果：完成' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'AI 辅助解析' }));

    await waitFor(() => expect(fake.imports.previewProjectsFromDocument).toHaveBeenCalled());
    const [file, mode] = fake.imports.previewProjectsFromDocument.mock.calls[0]!;
    expect(mode).toBe('ai');
    expect(file).toMatchObject({ name: 'pasted-project-text.txt', type: 'text/plain' });
    expect(new TextDecoder().decode(file.bytes)).toBe('# 项目一\n结果：完成');
  });

  it('renders semantic original and suggested text for an AI rewrite', async () => {
    const fake = installJobSearchFake();
    fake.imports.previewProjectsFromDocument.mockResolvedValue(preview());
    const { container } = render(
      <ProjectImportWizard onClose={vi.fn()} onCompleted={vi.fn()} open />,
    );
    fireEvent.change(screen.getByLabelText('选择项目文件'), {
      target: { files: [new File(['# 项目一'], 'notes.md', { type: 'text/markdown' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'AI 辅助解析' }));
    await screen.findByDisplayValue('项目一');
    fireEvent.click(screen.getByRole('button', { name: '进入字段确认' }));

    expect(container.querySelector('p.project-import-diff-original del')).toHaveTextContent('需求梳理与推进');
    expect(container.querySelector('p.project-import-diff-suggestion mark')).toHaveTextContent('负责需求梳理');
  });

  it('highlights a nonempty AI suggestion while keeping it confirmation-only', async () => {
    const fake = installJobSearchFake();
    const next = segment();
    next.fields.background = {
      value: '补全背景',
      provenance: 'ai-suggestion',
      evidence: '',
    };
    next.suggested.background = '补全背景';
    fake.imports.previewProjectsFromDocument.mockResolvedValue(preview({ segments: [next] }));
    const { container } = render(
      <ProjectImportWizard onClose={vi.fn()} onCompleted={vi.fn()} open />,
    );
    fireEvent.change(screen.getByLabelText('选择项目文件'), {
      target: { files: [new File(['# 项目一'], 'notes.md', { type: 'text/markdown' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'AI 辅助解析' }));
    await screen.findByDisplayValue('项目一');
    fireEvent.click(screen.getByRole('button', { name: '进入字段确认' }));

    expect(container.querySelector('p.project-import-diff-suggestion mark')).toHaveTextContent('补全背景');
    expect(screen.getAllByRole('button', { name: '接受建议' }).length).toBeGreaterThan(0);
  });

  it('removes local parsing and preserves the source after an AI error', async () => {
    const fake = installJobSearchFake();
    fake.imports.previewProjectsFromDocument.mockRejectedValue({
      code: 'AI_NOT_CONFIGURED',
      message: 'provider secret must stay hidden',
      providerMessage: 'do not show this',
    });
    render(<ProjectImportWizard onClose={vi.fn()} onCompleted={vi.fn()} open />);

    const source = '# 项目一\n结果：完成';
    fireEvent.change(screen.getByLabelText('粘贴项目文本'), { target: { value: source } });
    expect(screen.queryByRole('button', { name: '仅本地解析' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AI 辅助解析' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('尚未配置 AI 服务');
    expect(screen.getByLabelText('粘贴项目文本')).toHaveValue(source);
    expect(screen.queryByText('do not show this')).not.toBeInTheDocument();
  });

  it('sends an existing project as one in-memory TXT request and saves it by id', async () => {
    const fake = installJobSearchFake();
    const current = existingProject();
    const next = segment();
    next.fields.projectTime = { value: '', provenance: 'ai-suggestion', evidence: '' };
    next.suggested.projectTime = '';
    next.fields.role = { value: 'AI 项目角色', provenance: 'ai-rewrite', evidence: 'L2: 原项目角色' };
    next.suggested.role = 'AI 项目角色';
    next.fields.background = { value: '可核验背景', provenance: 'source', evidence: 'L3: 可核验背景' };
    next.suggested.background = '可核验背景';
    next.fields.unclassifiedNotes = { value: 'AI 不应覆盖原文', provenance: 'ai-rewrite', evidence: 'L4: 原始内容' };
    next.suggested.unclassifiedNotes = 'AI 不应覆盖原文';
    fake.imports.previewProjectsFromDocument.mockResolvedValue(preview({ segments: [next] }));
    fake.assets.projects.save.mockResolvedValue(current);
    const onCompleted = vi.fn();
    const onClose = vi.fn();
    render(<ProjectImportWizard existingProject={current} onClose={onClose} onCompleted={onCompleted} open />);

    expect(screen.getByRole('dialog', { name: 'AI 整理项目' })).toBeInTheDocument();
    expect(screen.getByLabelText('粘贴项目文本')).toHaveValue(
      `项目名称：${current.name}\n项目角色：${current.role}\n项目时间：${current.projectTime}\n项目内容：\n${current.unclassifiedNotes}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'AI 整理' }));

    await waitFor(() => expect(fake.imports.previewProjectsFromDocument).toHaveBeenCalled());
    const [file, mode] = fake.imports.previewProjectsFromDocument.mock.calls[0]!;
    expect(mode).toBe('ai');
    expect(file).toMatchObject({ name: 'existing-project.txt', type: 'text/plain' });
    expect(new TextDecoder().decode(file.bytes)).toContain(current.unclassifiedNotes);
    fireEvent.click(screen.getByRole('button', { name: '进入字段确认' }));
    expect(screen.queryByLabelText('待整理内容')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存项目' }));

    await waitFor(() => expect(fake.assets.projects.save).toHaveBeenCalledWith(expect.objectContaining({
      id: current.id,
      role: 'AI 项目角色',
      projectTime: current.projectTime,
      background: '可核验背景',
      unclassifiedNotes: current.unclassifiedNotes,
    })));
    expect(fake.assets.projects.save).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
