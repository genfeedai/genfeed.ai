/**
 * Discriminated union for async operation states
 *
 * Replaces multiple boolean flags like:
 * - isLoading, isError, isSuccess
 * - isSubmitting, hasError, data
 *
 * Benefits:
 * - Impossible states are unrepresentable
 * - TypeScript narrows types automatically in switch/if blocks
 * - Self-documenting state machine
 *
 * @example
 * ```tsx
 * const [state, setState] = useState<AsyncState<User>>({ status: 'idle' });
 *
 * switch (state.status) {
 *   case 'idle':
 *     return <Button onClick={fetchUser}>Load User</Button>;
 *   case 'loading':
 *     return <Spinner />;
 *   case 'success':
 *     return <UserCard user={state.data} />;
 *   case 'error':
 *     return <ErrorMessage error={state.error} onRetry={fetchUser} />;
 * }
 * ```
 */
export type AsyncState<TData, TError = Error> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: TData }
  | { status: 'error'; error: TError };

/**
 * Extended async state with refresh capability
 * Used for data that can be refetched
 */
export type AsyncStateWithRefresh<TData, TError = Error> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'refreshing'; data: TData }
  | { status: 'success'; data: TData }
  | { status: 'error'; error: TError };

/**
 * Paginated async state for list data
 */
export type PaginatedAsyncState<TData, TError = Error> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loading-more'; data: TData[]; hasMore: boolean }
  | { status: 'refreshing'; data: TData[]; hasMore: boolean }
  | { status: 'success'; data: TData[]; hasMore: boolean }
  | { status: 'error'; error: TError };

/**
 * Type guard helpers for AsyncState
 */
export const AsyncStateHelpers = {
  getData: <T, E>(state: AsyncState<T, E>): T | undefined =>
    state.status === 'success' ? state.data : undefined,

  getError: <T, E>(state: AsyncState<T, E>): E | undefined =>
    state.status === 'error' ? state.error : undefined,

  isError: <T, E>(
    state: AsyncState<T, E>,
  ): state is { status: 'error'; error: E } => state.status === 'error',
  isIdle: <T, E>(state: AsyncState<T, E>): state is { status: 'idle' } =>
    state.status === 'idle',

  isLoading: <T, E>(state: AsyncState<T, E>): state is { status: 'loading' } =>
    state.status === 'loading',

  isSuccess: <T, E>(
    state: AsyncState<T, E>,
  ): state is { status: 'success'; data: T } => state.status === 'success',
};
