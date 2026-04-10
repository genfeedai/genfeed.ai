import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/enums', () => ({
  ErrorCode: {
    ALREADY_EXISTS: 'ALREADY_EXISTS',
    CONFLICT: 'CONFLICT',
    FORBIDDEN: 'FORBIDDEN',
    INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    TIMEOUT: 'TIMEOUT',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    UNAUTHORIZED: 'UNAUTHORIZED',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockNotificationsError = vi.hoisted(() => vi.fn());
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mockNotificationsError,
    }),
  },
}));

import {
  ErrorHandler,
  getErrorMessage,
  getErrorStatus,
  hasErrorDetail,
  type IApiError,
  type IJsonApiError,
  isAxiosError,
} from '@utils/error/error-handler.util';

describe('error-handler.util', () => {
  describe('isAxiosError', () => {
    it('should return true for axios error objects', () => {
      const error = { isAxiosError: true, message: 'test', response: {} };
      expect(isAxiosError(error)).toBe(true);
    });

    it('should return false for plain Error', () => {
      expect(isAxiosError(new Error('test'))).toBe(false);
    });

    it('should return false for null', () => {
      expect(isAxiosError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAxiosError(undefined)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isAxiosError('error string')).toBe(false);
    });

    it('should return false for object without isAxiosError', () => {
      expect(isAxiosError({ message: 'test' })).toBe(false);
    });

    it('should return false when isAxiosError is not true', () => {
      expect(isAxiosError({ isAxiosError: false })).toBe(false);
    });
  });

  describe('getErrorStatus', () => {
    it('should return status from axios error', () => {
      const error = {
        isAxiosError: true,
        response: { data: {}, status: 404 },
      };
      expect(getErrorStatus(error)).toBe(404);
    });

    it('should return undefined for non-axios error', () => {
      expect(getErrorStatus(new Error('test'))).toBeUndefined();
    });

    it('should return undefined when response is missing', () => {
      const error = { isAxiosError: true };
      expect(getErrorStatus(error)).toBeUndefined();
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from axios error response data', () => {
      const error = {
        isAxiosError: true,
        message: 'fallback message',
        response: { data: { message: 'API error' }, status: 400 },
      };
      expect(getErrorMessage(error, 'default')).toBe('API error');
    });

    it('should fall back to axios error.message when no response data', () => {
      const error = {
        isAxiosError: true,
        message: 'Network Error',
        response: { data: {} },
      };
      expect(getErrorMessage(error, 'default')).toBe('Network Error');
    });

    it('should extract message from standard Error', () => {
      expect(getErrorMessage(new Error('something failed'), 'default')).toBe(
        'something failed',
      );
    });

    it('should return fallback for unknown error types', () => {
      expect(getErrorMessage('string error', 'fallback text')).toBe(
        'fallback text',
      );
    });

    it('should return fallback for null', () => {
      expect(getErrorMessage(null, 'fallback')).toBe('fallback');
    });
  });

  describe('hasErrorDetail', () => {
    it('should return true when detail contains search text', () => {
      const error = {
        isAxiosError: true,
        response: { data: { detail: 'Rate limit exceeded for user' } },
      };
      expect(hasErrorDetail(error, 'Rate limit')).toBe(true);
    });

    it('should return false when detail does not contain search text', () => {
      const error = {
        isAxiosError: true,
        response: { data: { detail: 'Not found' } },
      };
      expect(hasErrorDetail(error, 'Rate limit')).toBe(false);
    });

    it('should return false for non-axios error', () => {
      expect(hasErrorDetail(new Error('test'), 'test')).toBe(false);
    });

    it('should return false when no detail present', () => {
      const error = {
        isAxiosError: true,
        response: { data: {} },
      };
      expect(hasErrorDetail(error, 'anything')).toBe(false);
    });
  });

  describe('ErrorHandler', () => {
    describe('isJsonApiError', () => {
      it('should return true for valid JSON:API error', () => {
        const error: IJsonApiError = {
          errors: [{ code: 400, detail: 'Bad request', title: 'Error' }],
        };
        expect(ErrorHandler.isJsonApiError(error)).toBe(true);
      });

      it('should return false for non-object', () => {
        expect(ErrorHandler.isJsonApiError('string')).toBe(false);
      });

      it('should return false for null', () => {
        expect(ErrorHandler.isJsonApiError(null)).toBe(false);
      });

      it('should return false for object without errors array', () => {
        expect(ErrorHandler.isJsonApiError({ message: 'test' })).toBe(false);
      });

      it('should return false when errors is not an array', () => {
        expect(ErrorHandler.isJsonApiError({ errors: 'not array' })).toBe(
          false,
        );
      });
    });

    describe('isApiError', () => {
      it('should return true for valid API error', () => {
        const error: IApiError = {
          code: 'NOT_FOUND',
          detail: 'Resource not found',
          status: 404,
          title: 'Not Found',
        };
        expect(ErrorHandler.isApiError(error)).toBe(true);
      });

      it('should return false for incomplete API error', () => {
        expect(ErrorHandler.isApiError({ code: 'NOT_FOUND' })).toBe(false);
      });

      it('should return false for null', () => {
        expect(ErrorHandler.isApiError(null)).toBe(false);
      });
    });

    describe('convertJsonApiError', () => {
      it('should convert first JSON:API error to API error', () => {
        const jsonApiError: IJsonApiError = {
          errors: [
            {
              code: 404,
              detail: 'User not found',
              title: 'Not Found',
            },
          ],
        };
        const result = ErrorHandler.convertJsonApiError(jsonApiError);
        expect(result).not.toBeNull();
        expect(result?.status).toBe(404);
        expect(result?.detail).toBe('User not found');
        expect(result?.code).toBe('NOT_FOUND');
        expect(result?.title).toBe('Not Found');
        expect(result?.timestamp).toBeDefined();
      });

      it('should return null for empty errors array', () => {
        const jsonApiError: IJsonApiError = { errors: [] };
        expect(ErrorHandler.convertJsonApiError(jsonApiError)).toBeNull();
      });

      it('should map known status codes to error codes', () => {
        const test400: IJsonApiError = {
          errors: [{ code: 400, detail: 'Bad', title: 'Bad' }],
        };
        expect(ErrorHandler.convertJsonApiError(test400)?.code).toBe(
          'VALIDATION_FAILED',
        );

        const test401: IJsonApiError = {
          errors: [{ code: 401, detail: 'Unauth', title: 'Unauth' }],
        };
        expect(ErrorHandler.convertJsonApiError(test401)?.code).toBe(
          'UNAUTHORIZED',
        );

        const test429: IJsonApiError = {
          errors: [{ code: 429, detail: 'Limit', title: 'Limit' }],
        };
        expect(ErrorHandler.convertJsonApiError(test429)?.code).toBe(
          'RATE_LIMIT_EXCEEDED',
        );
      });

      it('should map unknown status codes to UNKNOWN_ERROR', () => {
        const error: IJsonApiError = {
          errors: [{ code: 418, detail: "I'm a teapot", title: 'Teapot' }],
        };
        expect(ErrorHandler.convertJsonApiError(error)?.code).toBe(
          'UNKNOWN_ERROR',
        );
      });
    });

    describe('extractErrorDetails', () => {
      it('should extract details from JSON:API error response', () => {
        const error = {
          response: {
            data: {
              errors: [
                { code: 400, detail: 'Validation failed', title: 'Error' },
              ],
            },
            status: 400,
          },
        };
        const result = ErrorHandler.extractErrorDetails(error);
        expect(result.message).toBe('Validation failed');
        expect(result.status).toBe(400);
      });

      it('should extract details from API error response', () => {
        const error = {
          response: {
            data: {
              code: 'NOT_FOUND',
              detail: 'Resource not found',
              status: 404,
              title: 'Not Found',
            },
            status: 404,
          },
        };
        const result = ErrorHandler.extractErrorDetails(error);
        expect(result.message).toBe('Resource not found');
        expect(result.code).toBe('NOT_FOUND');
      });

      it('should extract message from response data with message field', () => {
        const error = {
          response: {
            data: { message: 'Something went wrong' },
            status: 500,
          },
        };
        const result = ErrorHandler.extractErrorDetails(error);
        expect(result.message).toBe('Something went wrong');
      });

      it('should extract error message from error.message', () => {
        const error = { message: 'Network failure' };
        const result = ErrorHandler.extractErrorDetails(error);
        expect(result.message).toBe('Network failure');
      });

      it('should return default message for unknown error shape', () => {
        const result = ErrorHandler.extractErrorDetails({});
        expect(result.message).toBe('An unexpected error occurred');
      });
    });

    describe('isAbortError', () => {
      it('should return true for AbortError', () => {
        expect(ErrorHandler.isAbortError({ name: 'AbortError' })).toBe(true);
      });

      it('should return true for ECONNABORTED', () => {
        expect(ErrorHandler.isAbortError({ code: 'ECONNABORTED' })).toBe(true);
      });

      it('should return false for other errors', () => {
        expect(ErrorHandler.isAbortError({ name: 'TypeError' })).toBe(false);
      });
    });

    describe('handle', () => {
      beforeEach(() => {
        mockNotificationsError.mockClear();
      });

      it('should show validation errors when present', () => {
        const error = {
          response: {
            data: {
              code: 'VALIDATION_FAILED',
              detail: 'Validation failed',
              status: 400,
              title: 'Validation',
              validationErrors: [{ field: 'email', message: 'Invalid email' }],
            },
          },
        };
        ErrorHandler.handle(error, 'Test');
        expect(mockNotificationsError).toHaveBeenCalledWith(
          'Validation failed: email: Invalid email',
        );
      });

      it('should show fixed message for known error codes', () => {
        const error = {
          response: {
            data: {
              code: 'UNAUTHORIZED',
              detail: 'Token expired',
              status: 401,
              title: 'Unauthorized',
            },
          },
        };
        ErrorHandler.handle(error);
        expect(mockNotificationsError).toHaveBeenCalledWith(
          'Session expired. Please sign in again.',
        );
      });

      it('should show detail message for fallback error codes', () => {
        const error = {
          response: {
            data: {
              code: 'NOT_FOUND',
              detail: 'User not found',
              status: 404,
              title: 'Not Found',
            },
          },
        };
        ErrorHandler.handle(error);
        expect(mockNotificationsError).toHaveBeenCalledWith('User not found');
      });

      it('should show generic error message for unknown errors', () => {
        ErrorHandler.handle({ message: 'Unknown' });
        expect(mockNotificationsError).toHaveBeenCalledWith('Unknown');
      });
    });

    describe('handleSilently', () => {
      it('should not show notifications', () => {
        mockNotificationsError.mockClear();
        ErrorHandler.handleSilently({ message: 'Silent error' });
        expect(mockNotificationsError).not.toHaveBeenCalled();
      });
    });

    describe('getUserMessage', () => {
      it('should return user message for known error codes', () => {
        const error = {
          response: {
            data: {
              code: 'FORBIDDEN',
              detail: 'Access denied',
              status: 403,
              title: 'Forbidden',
            },
          },
        };
        expect(ErrorHandler.getUserMessage(error)).toBe(
          'You do not have permission to access this resource.',
        );
      });

      it('should return detail message for unknown error codes', () => {
        const error = { message: 'Custom error' };
        expect(ErrorHandler.getUserMessage(error)).toBe('Custom error');
      });

      it('should return default message for empty errors', () => {
        expect(ErrorHandler.getUserMessage({})).toBe(
          'An unexpected error occurred',
        );
      });
    });
  });
});
