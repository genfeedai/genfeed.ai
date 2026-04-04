/**
 * Safely extract a human-readable error message from unknown errors.
 */
export const getErrorMessage = (error: unknown): string => {
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
};
