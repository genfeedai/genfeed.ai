import { describe, expect, it } from 'vitest';
import {
  isCancelledRequest,
  isServiceOperationError,
  normalizeOperationError,
  SERVICE_OPERATION_ERROR_NAME,
} from './operation-error';

describe('normalizeOperationError', () => {
  it('converts a rejected JSON:API object payload into a ServiceOperationError', () => {
    const payload = {
      errors: [
        {
          code: '422',
          detail: 'Unsorted shelf is temporarily unavailable',
          meta: {
            email: 'user@example.com',
            token: 'secret-token',
          },
          title: 'Ingredient query failed',
        },
      ],
      request: {
        body: { password: 'super-secret' },
      },
    };

    const normalized = normalizeOperationError('GET /ingredients', payload);

    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.name).toBe(SERVICE_OPERATION_ERROR_NAME);
    expect(normalized.message).toBe(
      'Unsorted shelf is temporarily unavailable',
    );
    expect(normalized.category).toBe('Ingredient query failed');
    expect(normalized.status).toBe(422);
    expect(normalized.metadata).toEqual({ operation: 'GET /ingredients' });
    expect(normalized).not.toHaveProperty('originalError');
    expect(normalized).not.toHaveProperty('errors');
    expect(normalized).not.toHaveProperty('request');
    expect(JSON.stringify(normalized)).not.toContain('user@example.com');
    expect(JSON.stringify(normalized)).not.toContain('secret-token');
    expect(JSON.stringify(normalized)).not.toContain('super-secret');
  });

  it('omits private JSON:API detail from the client message and uses the title', () => {
    const payload = {
      errors: [
        {
          code: '500',
          detail: 'Failed for user@example.com with token secret-token',
          title: 'Ingredient query failed',
        },
      ],
    };

    const normalized = normalizeOperationError('GET /ingredients', payload);

    expect(normalized.message).toBe('Ingredient query failed');
    expect(normalized.category).toBe('Ingredient query failed');
    expect(normalized.message).not.toContain('user@example.com');
    expect(normalized.message).not.toContain('secret-token');
  });

  it('normalizes a generic service Error with operation context', () => {
    const normalized = normalizeOperationError(
      'GET /ingredients',
      new Error('Network error'),
    );

    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.name).toBe(SERVICE_OPERATION_ERROR_NAME);
    expect(normalized.message).toBe('Network error');
    expect(normalized.category).toBe('service_operation');
    expect(normalized.metadata).toEqual({ operation: 'GET /ingredients' });
    expect(normalized).not.toHaveProperty('originalError');
  });

  it('preserves timeout flags so Sentry can drop expected network failures', () => {
    const timeout = Object.assign(new Error('Request timed out'), {
      isTimeout: true,
    });

    const normalized = normalizeOperationError('collectAllPages', timeout);

    expect(normalized.isTimeout).toBe(true);
    expect(normalized.message).toBe('Request timed out');
  });

  it('keeps safe Nest validation details for actionable diagnostics', () => {
    const normalized = normalizeOperationError('GET /posts', {
      message: 'Validation failed',
      response: {
        data: {
          errors: [
            {
              constraints: {
                whitelistValidation: 'property folderId should not exist',
              },
              property: 'folderId',
            },
          ],
        },
        status: 400,
      },
    });

    expect(normalized.validationErrors).toEqual({
      folderId: ['property folderId should not exist'],
    });
    expect(normalized.status).toBe(400);
  });

  it('does not throw when the original error is missing', () => {
    const normalized = normalizeOperationError('GET /ingredients', undefined);

    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.message).toBe('Service operation failed');
    expect(normalized.isTimeout).toBe(false);
  });

  it('returns an already-normalized operation error without wrapping again', () => {
    const first = normalizeOperationError(
      'GET /ingredients',
      new Error('Network error'),
    );
    const second = normalizeOperationError('GET /ingredients', first);

    expect(second).toBe(first);
    expect(second.metadata).toEqual({ operation: 'GET /ingredients' });
  });
});

describe('operation-error guards', () => {
  it('detects cancelled request markers', () => {
    expect(isCancelledRequest({ isCancelled: true, silent: true })).toBe(true);
    expect(isCancelledRequest(new Error('nope'))).toBe(false);
  });

  it('detects ServiceOperationError instances', () => {
    const normalized = normalizeOperationError(
      'GET /ingredients',
      new Error('Network error'),
    );

    expect(isServiceOperationError(normalized)).toBe(true);
    expect(isServiceOperationError(new Error('Network error'))).toBe(false);
  });
});
