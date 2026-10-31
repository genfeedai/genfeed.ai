import { ApiRequestError } from '@/services/api/base-http.service';

const SIGN_IN_MESSAGES = new Set([
  'No authentication token available',
  'Not authenticated',
]);

export function recoverableErrorCopy(error: Error): {
  message: string;
  subMessage: string;
} {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return { message: 'Sign in required', subMessage: error.message };
    }

    if (error.status === 403) {
      return { message: 'Access denied', subMessage: error.message };
    }

    if (error.status === 404) {
      return { message: 'Not found', subMessage: error.message };
    }
  }

  if (SIGN_IN_MESSAGES.has(error.message)) {
    return {
      message: 'Sign in required',
      subMessage: 'Your session expired. Sign in again to continue.',
    };
  }

  return { message: 'Something went wrong', subMessage: error.message };
}
