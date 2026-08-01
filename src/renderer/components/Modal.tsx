import { type MouseEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { lockBodyScroll } from '../utils/bodyScrollLock';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  closeDisabled?: boolean;
  dismissal?: 'close-button-only' | 'standard';
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeDisabled = false,
  dismissal = 'standard',
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open]);

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (dismissal === 'standard' && !closeDisabled && event.target === event.currentTarget) onClose();
  };

  useEffect(() => {
    if (!open) return;

    return lockBodyScroll();
  }, [open]);

  return (
    <dialog
      aria-labelledby={titleId}
      aria-modal="true"
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        if (dismissal === 'standard' && !closeDisabled) onClose();
      }}
      onClose={() => {
        if (dismissal === 'standard' && open) onClose();
      }}
      onClick={handleBackdropClick}
      ref={dialogRef}
    >
      <div className="modal__panel">
        <header className="modal__header">
          <div>
            <p className="modal__kicker">工作台 / DIALOG</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            aria-label="关闭对话框"
            className="modal__close"
            disabled={closeDisabled}
            onClick={() => {
              if (!closeDisabled) onClose();
            }}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
