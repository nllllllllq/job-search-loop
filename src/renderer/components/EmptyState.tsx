import type { ReactNode } from 'react';
import { useId } from 'react';

interface EmptyStateProps {
  title: string;
  body: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}

export function EmptyState({
  title,
  body,
  icon,
  action,
  children,
}: EmptyStateProps) {
  const titleId = useId();
  const actions = action ?? children;

  return (
    <section className="empty-state" aria-labelledby={titleId}>
      <div className="empty-state__mark" aria-hidden="true">
        {icon ?? <span />}
      </div>
      <div className="empty-state__content">
        <p className="empty-state__kicker">待记录 / EMPTY LOG</p>
        <h2 id={titleId}>{title}</h2>
        <div className="empty-state__body">{body}</div>
        {actions ? <div className="empty-state__actions">{actions}</div> : null}
      </div>
    </section>
  );
}
