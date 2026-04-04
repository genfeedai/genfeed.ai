import { describe, expect, it, vi } from 'vitest';

/**
 * axios-error.util.test.ts tests the error-handler.util module
 * which serves as the primary axios error handling utility.
 * This file focuses on axios-specific error patterns.
 */

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

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn() }),
  },
}));

import {
  getErrorMessage,
  getErrorStatus,
  hasErrorDetail,
  isAxiosError,
} from '@utils/error/error-handler.util';

describe('axios-error.util (via error-handler)', () => {
  describe('isAxiosError — edge cases', () => {
    it('should return false for number', () => {
      expect(isAxiosError(42)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isAxiosError({})).toBe(false);
    });

    it('should handle object with isAxiosError set to truthy non-boolean', () => {
      expect(isAxiosError({ isAxiosError: 1 })).toBe(false);
    });

    it('should return true for full axios error shape', () => {
      const error = {
        code: 'ERR_BAD_REQUEST',
        config: {},
        isAxiosError: true,
        message: 'Request failed with status code 400',
        name: 'AxiosError',
        response: {
          data: { message: 'Invalid input' },
          headers: {},
          status: 400,
          statusText: 'Bad Request',
        },
      };
      expect(isAxiosError(error)).toBe(true);
    });
  });

  describe('getErrorStatus — various HTTP statuses', () => {
    it.each([
      [400, 'Bad Request'],
      [401, 'Unauthorized'],
      [403, 'Forbidden'],
      [404, 'Not Found'],
      [409, 'Conflict'],
      [429, 'Too Many Requests'],
      [500, 'Internal Server Error'],
      [503, 'Service Unavailable'],
    ])('should extract status %i (%s)', (status) => {
      const error = { isAxiosError: true, response: { status } };
      expect(getErrorStatus(error)).toBe(status);
    });
  });

  describe('getErrorMessage — axios response variations', () => {
    it('should prefer response.data.message over error.message', () => {
      const error = {
        isAxiosError: true,
        message: 'Generic message',
        response: { data: { message: 'Specific API message' } },
      };
      expect(getErrorMessage(error, 'default')).toBe('Specific API message');
    });

    it('should use error.message when data.message is empty', () => {
      const error = {
        isAxiosError: true,
        message: 'Network Error',
        response: { data: { message: '' } },
      };
      expect(getErrorMessage(error, 'default')).toBe('Network Error');
    });

    it('should use fallback when both data.message and error.message are empty', () => {
      const error = {
        isAxiosError: true,
        message: '',
        response: { data: {} },
      };
      expect(getErrorMessage(error, 'Something failed')).toBe(
        'Something failed',
      );
    });
  });

  describe('hasErrorDetail — detail matching', () => {
    it('should match partial text in detail', () => {
      const error = {
        isAxiosError: true,
        response: {
          data: { detail: 'User with email test@example.com already exists' },
        },
      };
      expect(hasErrorDetail(error, 'already exists')).toBe(true);
    });

    it('should be case-sensitive', () => {
      const error = {
        isAxiosError: true,
        response: { data: { detail: 'Not Found' } },
      };
      expect(hasErrorDetail(error, 'not found')).toBe(false);
      expect(hasErrorDetail(error, 'Not Found')).toBe(true);
    });
  });
});
