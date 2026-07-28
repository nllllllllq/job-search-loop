import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from 'react';

interface DashboardDrawerProps {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
  eyebrow: string;
}

export function DashboardDrawer({
  children,
  onClose,
  open,
  title,
  eyebrow,
}: DashboardDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="dashboard-drawer-layer">
      <button
        aria-label="关闭抽屉"
        className="dashboard-drawer__backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className="dashboard-drawer"
        role="dialog"
      >
        <header className="dashboard-drawer__header">
          <div>
            <p className="section-label">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            aria-label={`关闭${title}`}
            className="dashboard-drawer__close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="dashboard-drawer__body">{children}</div>
      </aside>
    </div>
  );
}
