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
