export interface UseAsyncStateOptions {
  initialLoading?: boolean;
  onError?: (error: Error) => void;
}

export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  setData: (data: T | null) => void;
  setIsLoading: (loading: boolean) => void;
  setIsRefreshing: (refreshing: boolean) => void;
  setError: (error: Error | null) => void;
  execute: <R = T>(
    asyncFunction: (signal?: AbortSignal) => Promise<R>,
    options?: {
      isRefresh?: boolean;
      onSuccess?: (result: R) => void;
      onError?: (error: Error) => void;
    },
  ) => Promise<R | undefined>;
  reset: () => void;
}
