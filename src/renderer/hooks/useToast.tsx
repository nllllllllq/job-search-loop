import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastOptions {
  duration?: number;
}

interface ToastEntry {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

interface ToastProviderProps {
  children: ReactNode;
  defaultDuration?: number;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({
  children,
  defaultDuration = 4_500,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const add = useCallback(
    (tone: ToastTone, message: string, options?: ToastOptions) => {
      const id = `toast-${nextIdRef.current++}`;
      setToasts((current) => [...current, { id, message, tone }]);

      const duration = options?.duration ?? defaultDuration;
      if (duration > 0) {
        const timer = setTimeout(() => {
          timersRef.current.delete(id);
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [defaultDuration],
  );

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    },
    [],
  );

  const value = useMemo<ToastApi>(
    () => ({
      dismiss,
      error: (message, options) => add('error', message, options),
      info: (message, options) => add('info', message, options),
      success: (message, options) => add('success', message, options),
    }),
    [add, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label="通知"
        aria-live="polite"
        aria-relevant="additions text"
        className="toast-region"
        role="region"
      >
        {toasts.map((toast) => (
          <div
            className="toast"
            data-tone={toast.tone}
            key={toast.id}
          >
            <span className="toast__mark" aria-hidden="true" />
            <span className="toast__message" data-toast-id={toast.id}>
              {toast.message}
            </span>
            <button
              aria-label={`关闭通知：${toast.message}`}
              className="toast__close"
              onClick={() => dismiss(toast.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast 必须在 ToastProvider 内使用');
  }
  return context;
}
