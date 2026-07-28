import {
  type DependencyList,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface AsyncResource<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<T | undefined>;
  setData: Dispatch<SetStateAction<T | null>>;
}

function resourceError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  const error = new Error('加载资源时发生未知错误');
  if (
    reason !== null
    && typeof reason === 'object'
    && 'code' in reason
    && typeof reason.code === 'string'
  ) {
    Object.defineProperty(error, 'code', {
      configurable: false,
      enumerable: false,
      value: reason.code,
      writable: false,
    });
  }
  return error;
}

export function useAsyncResource<T>(
  loader: () => Promise<T>,
  dependencies: DependencyList = [],
): AsyncResource<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const loaderRef = useRef(loader);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await loaderRef.current();
      if (mountedRef.current && requestId === requestIdRef.current) {
        setDataState(result);
        setLoading(false);
      }
      return result;
    } catch (reason) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError(resourceError(reason));
        setLoading(false);
      }
      return undefined;
    }
  }, []);

  const setData = useCallback<Dispatch<SetStateAction<T | null>>>((value) => {
    requestIdRef.current += 1;
    setDataState(value);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    void reload();
    // The caller explicitly controls reloads through this dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return { data, loading, error, reload, setData };
}
