import { useMemo } from 'react';
import type {
  InterviewReviewReusableItem,
  Question,
  QuestionInput,
} from '../../../shared/domain';
import { useToast } from '../../hooks/useToast';
import { QuestionEditor } from './QuestionEditor';

export type QuestionReviewReusableItem = Omit<InterviewReviewReusableItem, 'targetType'> & {
  targetType: 'question';
};

export interface ReviewToQuestionEditorProps {
  item: QuestionReviewReusableItem;
  onClose: () => void;
  onSaved: (question: Question) => void | Promise<void>;
  open: boolean;
}

function toQuestionInput(item: QuestionReviewReusableItem): QuestionInput {
  return {
    type: 'interviewer',
    text: item.title,
    answerDraft: item.content,
    projectIds: [],
    capabilityIds: [],
    occurrenceCount: 1,
    status: 'active',
  };
}

export function ReviewToQuestionEditor({
  item,
  onClose,
  onSaved,
  open,
}: ReviewToQuestionEditorProps) {
  const toast = useToast();
  const initialValue = useMemo(() => toQuestionInput(item), [item]);

  const save = async (input: QuestionInput) => {
    let saved: Question;
    try {
      saved = await window.jobSearch.assets.questions.save(input);
    } catch {
      toast.error('保存问题失败，请稍后重试');
      throw new Error('question save failed');
    }
    await onSaved(saved);
    onClose();
  };

  return (
    <QuestionEditor
      capabilities={[]}
      initialValue={initialValue}
      dialogTitle="纳入问题库"
      onClose={onClose}
      onSave={save}
      open={open}
      projects={[]}
      submitLabel="确认纳入问题库"
      type="interviewer"
    />
  );
}
