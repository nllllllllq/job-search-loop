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

export function useAsyncResource<T>(
  loader: () => Promise<T>,
  dependencies: DependencyList = [],
): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null);
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
        setData(result);
        setLoading(false);
      }
      return result;
    } catch (reason) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError(
          reason instanceof Error ? reason : new Error('加载资源时发生未知错误'),
        );
        setLoading(false);
      }
      return undefined;
    }
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
