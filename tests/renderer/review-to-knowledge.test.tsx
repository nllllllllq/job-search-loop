import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/renderer/hooks/useToast';
import {
  ReviewToCapabilityEditor,
  type CapabilityReviewReusableItem,
} from '../../src/renderer/features/dashboard/ReviewToCapabilityEditor';
import {
  ReviewToInsightEditor,
  type InsightReviewReusableItem,
} from '../../src/renderer/features/insights/ReviewToInsightEditor';
import {
  ReviewToQuestionEditor,
  type QuestionReviewReusableItem,
} from '../../src/renderer/features/questions/ReviewToQuestionEditor';
import type { Capability, Insight, Question } from '../../src/shared/domain';
import { installJobSearchFake, type JobSearchApiFake } from '../helpers/bridge';

const positionId = '55555555-5555-4555-8555-555555555555';

const questionItem: QuestionReviewReusableItem = {
  targetType: 'question',
  title: '你如何验证需求？',
  content: '先从高风险假设开始验证。',
};

const capabilityItem: CapabilityReviewReusableItem = {
  targetType: 'capability',
  title: '结构化表达',
  content: '能把复杂问题拆成结论、证据和行动。',
};

const insightItem: InsightReviewReusableItem = {
  targetType: 'insight',
  title: '回答先给判断',
  content: '先说结论，再补关键证据。',
};

function renderWithToast(ui: ReactElement) {
  return render(<ToastProvider defaultDuration={0}>{ui}</ToastProvider>);
}

function savedQuestion(): Question {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ...questionItem,
    type: 'interviewer',
    text: questionItem.title,
    answerDraft: questionItem.content,
    projectIds: [],
    capabilityIds: [],
    occurrenceCount: 1,
    status: 'active',
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
}

function savedCapability(): Capability {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: capabilityItem.title,
    jdFrequency: 0,
    evidence: capabilityItem.content,
    gaps: '',
    mergedIntoId: null,
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
}

function savedInsight(): Insight {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    title: insightItem.title,
    content: insightItem.content,
    positionId,
    projectId: null,
    questionId: null,
    capabilityId: null,
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
}

describe('review reusable item editors', () => {
  let fake: JobSearchApiFake;

  beforeEach(() => {
    fake = installJobSearchFake();
    fake.assets.questions.save.mockResolvedValue(savedQuestion());
    fake.assets.capabilities.save.mockResolvedValue(savedCapability());
    fake.assets.insights.save.mockResolvedValue(savedInsight());
  });

  it('maps and saves an edited interview question only after confirmation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderWithToast(
      <ReviewToQuestionEditor
        item={questionItem}
        onClose={onClose}
        onSaved={onSaved}
        open
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '纳入问题库' });
    expect(within(dialog).getByLabelText(/问题文本/)).toHaveValue(questionItem.title);
    expect(within(dialog).getByLabelText(/回答草稿/)).toHaveValue(questionItem.content);
    expect(within(dialog).getByRole('spinbutton', { name: /出现次数/ })).toHaveValue(1);
    expect(fake.assets.questions.save).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText(/问题文本/));
    await user.type(within(dialog).getByLabelText(/问题文本/), '请讲一个验证案例');
    await user.click(within(dialog).getByRole('button', { name: '确认纳入问题库' }));

    await waitFor(() => expect(fake.assets.questions.save).toHaveBeenCalledWith({
      type: 'interviewer',
      text: '请讲一个验证案例',
      answerDraft: questionItem.content,
      occurrenceCount: 1,
      status: 'active',
      projectIds: [],
      capabilityIds: [],
    }));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('cancels a question from the close button without saving', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderWithToast(
      <ReviewToQuestionEditor
        item={questionItem}
        onClose={onClose}
        onSaved={onSaved}
        open
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '纳入问题库' });
    expect(fake.assets.questions.save).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '关闭对话框' }));

    expect(fake.assets.questions.save).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps edited question values after a failed save', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    fake.assets.questions.save.mockRejectedValueOnce(new Error('disk failed'));
    renderWithToast(
      <ReviewToQuestionEditor
        item={questionItem}
        onClose={onClose}
        onSaved={onSaved}
        open
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '纳入问题库' });
    const text = within(dialog).getByLabelText(/问题文本/);
    const answer = within(dialog).getByLabelText(/回答草稿/);
    await user.clear(text);
    await user.type(text, '失败后仍保留的问题');
    await user.clear(answer);
    await user.type(answer, '失败后仍保留的回答草稿');
    await user.click(within(dialog).getByRole('button', { name: '确认纳入问题库' }));

    expect(await screen.findByText('保存问题失败，请稍后重试')).toBeInTheDocument();
    expect(fake.assets.questions.save).toHaveBeenCalledOnce();
    expect(text).toHaveValue('失败后仍保留的问题');
    expect(answer).toHaveValue('失败后仍保留的回答草稿');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('prevents duplicate pending question saves and closes after resolution', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    let resolveSave: (value: Question) => void = () => undefined;
    fake.assets.questions.save.mockImplementationOnce(
      () => new Promise<Question>((resolve) => { resolveSave = resolve; }),
    );
    renderWithToast(
      <ReviewToQuestionEditor
        item={questionItem}
        onClose={onClose}
        onSaved={onSaved}
        open
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '纳入问题库' });
    const save = within(dialog).getByRole('button', { name: '确认纳入问题库' });
    expect(fake.assets.questions.save).not.toHaveBeenCalled();
    await user.click(save);
    await user.click(save);

    expect(fake.assets.questions.save).toHaveBeenCalledOnce();
    expect(save).toBeDisabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    resolveSave(savedQuestion());
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('maps and saves an edited capability and preserves the draft after failure', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    fake.assets.capabilities.save.mockRejectedValueOnce(new Error('disk failed'));
    renderWithToast(
      <ReviewToCapabilityEditor
        item={capabilityItem}
        onClose={onClose}
        onSaved={onSaved}
        open
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '纳入能力' });
    expect(within(dialog).getByLabelText(/能力名称/)).toHaveValue(capabilityItem.title);
    expect(within(dialog).getByLabelText(/已有证据/)).toHaveValue(capabilityItem.content);
    await user.clear(within(dialog).getByLabelText(/能力名称/));
    await user.type(within(dialog).getByLabelText(/能力名称/), '结构化拆解');
    await user.click(within(dialog).getByRole('button', { name: '确认纳入能力' }));

    await waitFor(() => expect(fake.assets.capabilities.save).toHaveBeenCalledWith({
      name: '结构化拆解',
      evidence: capabilityItem.content,
      jdFrequency: 0,
      gaps: '',
      mergedIntoId: null,
    }));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText('保存能力失败，请稍后重试')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/能力名称/)).toHaveValue('结构化拆解');
    expect(within(dialog).getByLabelText(/已有证据/)).toHaveValue(capabilityItem.content);
  });

  it('maps insight text and source position while leaving other relations empty', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderWithToast(
      <ReviewToInsightEditor
        item={insightItem}
        onClose={onClose}
        onSaved={onSaved}
        open
        positionId={positionId}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '纳入心得' });
    expect(within(dialog).getByLabelText(/标题/)).toHaveValue(insightItem.title);
    expect(within(dialog).getByLabelText(/自由文本/)).toHaveValue(insightItem.content);
    expect(fake.assets.insights.save).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '确认纳入心得' }));

    await waitFor(() => expect(fake.assets.insights.save).toHaveBeenCalledWith({
      title: insightItem.title,
      content: insightItem.content,
      positionId,
      projectId: null,
      questionId: null,
      capabilityId: null,
    }));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('cancels an insight from the close button without saving', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderWithToast(
      <ReviewToInsightEditor
        item={insightItem}
        onClose={onClose}
        onSaved={onSaved}
        open
        positionId={positionId}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '纳入心得' });
    expect(fake.assets.insights.save).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '关闭对话框' }));

    expect(fake.assets.insights.save).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps edited insight values after a failed save', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    fake.assets.insights.save.mockRejectedValueOnce(new Error('disk failed'));
    renderWithToast(
      <ReviewToInsightEditor
        item={insightItem}
        onClose={onClose}
        onSaved={onSaved}
        open
        positionId={positionId}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '纳入心得' });
    const title = within(dialog).getByLabelText(/标题/);
    const content = within(dialog).getByLabelText(/自由文本/);
    await user.clear(title);
    await user.type(title, '失败后仍保留的心得标题');
    await user.clear(content);
    await user.type(content, '失败后仍保留的心得内容');
    await user.click(within(dialog).getByRole('button', { name: '确认纳入心得' }));

    expect(await screen.findByText('保存心得失败，请稍后重试')).toBeInTheDocument();
    expect(fake.assets.insights.save).toHaveBeenCalledOnce();
    expect(title).toHaveValue('失败后仍保留的心得标题');
    expect(content).toHaveValue('失败后仍保留的心得内容');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('prevents duplicate pending insight saves and closes after resolution', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    let resolveSave: (value: Insight) => void = () => undefined;
    fake.assets.insights.save.mockImplementationOnce(
      () => new Promise<Insight>((resolve) => { resolveSave = resolve; }),
    );
    renderWithToast(
      <ReviewToInsightEditor
        item={insightItem}
        onClose={onClose}
        onSaved={onSaved}
        open
        positionId={positionId}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '纳入心得' });
    const save = within(dialog).getByRole('button', { name: '确认纳入心得' });
    expect(fake.assets.insights.save).not.toHaveBeenCalled();
    await user.click(save);
    await user.click(save);

    expect(fake.assets.insights.save).toHaveBeenCalledOnce();
    expect(save).toBeDisabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    resolveSave(savedInsight());
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('cancels from the close button without saving and ignores duplicate submits while saving', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    let resolveSave: (value: Capability) => void = () => undefined;
    fake.assets.capabilities.save.mockImplementationOnce(
      () => new Promise<Capability>((resolve) => { resolveSave = resolve; }),
    );
    const view = renderWithToast(
      <ReviewToCapabilityEditor
        item={capabilityItem}
        onClose={onClose}
        onSaved={onSaved}
        open
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '纳入能力' });
    await user.click(within(dialog).getByRole('button', { name: '关闭对话框' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(fake.assets.capabilities.save).not.toHaveBeenCalled();

    view.rerender(
      <ToastProvider defaultDuration={0}>
        <ReviewToCapabilityEditor
          item={capabilityItem}
          onClose={onClose}
          onSaved={onSaved}
          open
        />
      </ToastProvider>,
    );
    const reopened = screen.getByRole('dialog', { name: '纳入能力' });
    const save = within(reopened).getByRole('button', { name: '确认纳入能力' });
    await user.click(save);
    await user.click(save);
    expect(fake.assets.capabilities.save).toHaveBeenCalledOnce();
    expect(save).toBeDisabled();

    resolveSave(savedCapability());
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
