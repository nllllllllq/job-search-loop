import type { ReactNode } from 'react';
import { EmptyState } from '../../components/EmptyState';

interface ResourceViewProps {
  loading: boolean;
  error: Error | null;
  errorTitle: string;
  empty: boolean;
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: ReactNode;
  loadingLabel: string;
  children: ReactNode;
}

export function ResourceView({
  loading,
  error,
  errorTitle,
  empty,
  emptyTitle,
  emptyBody,
  emptyAction,
  loadingLabel,
  children,
}: ResourceViewProps) {
  if (loading) {
    return (
      <div className="resource-state" role="status">
        <span className="resource-state__mark" aria-hidden="true" />
        {loadingLabel}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        body="本地数据暂时无法读取。请稍后重试；你的记录没有被修改。"
        icon="！"
        title={errorTitle}
      />
    );
  }

  if (empty) {
    return (
      <EmptyState
        action={emptyAction}
        body={emptyBody}
        icon="＋"
        title={emptyTitle}
      />
    );
  }

  return children;
}
