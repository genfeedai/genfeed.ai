/**
 * Safely extract a human-readable error message from unknown errors.
 */
export type ErrorMessagePolicy<TFallback> = {
  coerceMessage?: boolean;
  emptyMessage?: 'fallback' | 'preserve';
  fallback: (error: unknown) => TFallback;
  messageSource?: 'error-instance' | 'property';
};

export function getErrorMessage(error: unknown): string;
export function getErrorMessage<TFallback>(
  error: unknown,
  policy: ErrorMessagePolicy<TFallback>,
): string | TFallback;
export function getErrorMessage<TFallback>(
  error: unknown,
  policy?: ErrorMessagePolicy<TFallback>,
): string | TFallback {
  if (policy) {
    const canReadProperty =
      error !== null &&
      (typeof error === 'object' || typeof error === 'function') &&
      'message' in error;
    const hasMessage =
      policy.messageSource === 'error-instance'
        ? error instanceof Error
        : canReadProperty;

    if (hasMessage) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string') {
        if (message || policy.emptyMessage !== 'fallback') {
          return message;
        }
      } else if (policy.coerceMessage) {
        return String(message);
      }
    }

    return policy.fallback(error);
  }

  if (!error) {
    return 'Unknown error';
  }

  if (error instanceof Error) {
    return error.message || 'Unknown error';
  }

  if (typeof error === 'object' && 'message' in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}
