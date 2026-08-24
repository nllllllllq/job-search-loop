import { useMemo } from 'react';
import type { InterviewReviewReusableItem, Project, ProjectInput } from '../../../shared/domain';
import { ProjectEditor } from './ProjectEditor';
import { useToast } from '../../hooks/useToast';

export type ProjectReviewReusableItem = Omit<InterviewReviewReusableItem, 'targetType'> & {
  targetType: 'project';
};

export interface ReviewToProjectEditorProps {
  open: boolean;
  item: ProjectReviewReusableItem;
  onClose: () => void;
  onSaved: (project: Project) => void | Promise<void>;
}

export function ReviewToProjectEditor({
  item,
  onClose,
  onSaved,
  open,
}: ReviewToProjectEditorProps) {
  const toast = useToast();
  const initialValue = useMemo<ProjectInput>(() => ({
    name: item.title,
    projectTime: '',
    background: '',
    goal: '',
    role: '',
    keyDecisions: '',
    outcome: '',
    evidence: '',
    reflections: '',
    storytellingVersions: '',
    unclassifiedNotes: item.content,
  }), [item.content, item.title]);

  const save = async (input: ProjectInput) => {
    let saved: Project;
    try {
      saved = await window.jobSearch.assets.projects.save(input);
    } catch {
      toast.error('保存项目失败，请稍后重试');
      throw new Error('project save failed');
    }
    await onSaved(saved);
    onClose();
  };

  return (
    <ProjectEditor
      dialogTitle="纳入项目档案"
      initialValue={initialValue}
      onClose={onClose}
      onSave={save}
      open={open}
      submitLabel="确认纳入项目档案"
    />
  );
}
