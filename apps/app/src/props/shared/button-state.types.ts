/**
 * Discriminated union for button states
 *
 * Replaces multiple boolean flags like:
 * - isLoading, isDisabled, isPending, showPing
 *
 * Benefits:
 * - Impossible states are unrepresentable (can't be loading AND disabled)
 * - Clear intent for each state
 * - Extends component API without breaking changes
 *
 * @example
 * ```tsx
 * function Button({ state, children, ...props }: ButtonProps) {
 *   switch (state.mode) {
 *     case 'interactive':
 *       return <button {...props}>{children}</button>;
 *     case 'loading':
 *       return <button disabled><Spinner /> {state.label ?? 'Loading...'}</button>;
 *     case 'disabled':
 *       return <button disabled title={state.reason}>{children}</button>;
 *     case 'pending':
 *       return <button {...props}>{children} {state.showPing && <Ping />}</button>;
 *   }
 * }
 * ```
 */
export type ButtonState =
  | { mode: 'interactive' }
  | { mode: 'loading'; label?: string }
  | { mode: 'disabled'; reason?: string }
  | { mode: 'pending'; showPing?: boolean };

/**
 * Submission button state with progress tracking
 * Used for forms and async operations
 */
export type SubmitButtonState =
  | { mode: 'idle' }
  | { mode: 'submitting'; progress?: number }
  | { mode: 'success'; message?: string }
  | { mode: 'error'; message: string };

/**
 * Toggle button state for on/off controls
 */
export type ToggleButtonState =
  | { mode: 'on' }
  | { mode: 'off' }
  | { mode: 'indeterminate' }
  | { mode: 'disabled'; reason?: string };

/**
 * Factory functions for creating button states
 */
export const ButtonStateFactory = {
  disabled: (reason?: string): ButtonState => ({ mode: 'disabled', reason }),
  interactive: (): ButtonState => ({ mode: 'interactive' }),
  loading: (label?: string): ButtonState => ({ label, mode: 'loading' }),
  pending: (showPing = true): ButtonState => ({ mode: 'pending', showPing }),
};

/**
 * Type guard helpers for ButtonState
 */
export const ButtonStateHelpers = {
  canInteract: (state: ButtonState): boolean =>
    state.mode === 'interactive' || state.mode === 'pending',

  isDisabled: (
    state: ButtonState,
  ): state is { mode: 'disabled'; reason?: string } =>
    state.mode === 'disabled',
  isInteractive: (state: ButtonState): state is { mode: 'interactive' } =>
    state.mode === 'interactive',

  isLoading: (
    state: ButtonState,
  ): state is { mode: 'loading'; label?: string } => state.mode === 'loading',

  isPending: (
    state: ButtonState,
  ): state is { mode: 'pending'; showPing?: boolean } =>
    state.mode === 'pending',
};
