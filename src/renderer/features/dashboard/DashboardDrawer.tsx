import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from 'react';
import { lockBodyScroll } from '../../utils/bodyScrollLock';

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
  const drawerRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const unlockScroll = lockBodyScroll();
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const nestedDialog = drawerRef.current?.querySelector<HTMLDialogElement>('dialog[open]');
      if (nestedDialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => {
        const dialog = element.closest('dialog');
        return dialog === null || dialog.hasAttribute('open');
      });
      if (focusable.length === 0) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!drawerRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      unlockScroll();
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="dashboard-drawer-layer">
      <div
        aria-hidden="true"
        className="dashboard-drawer__backdrop"
        onClick={onClose}
      />
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className="dashboard-drawer"
        ref={drawerRef}
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
