import { SERVICE_OPERATION_ERROR_NAME } from '@services/core/operation-error';
import { describe, expect, it } from 'vitest';

import { isApiKeyLimitReached } from './api-key-create-error';

function operationError(
  message: string,
  fields: { category?: string; status?: number },
): Error {
  const error = new Error(message);
  error.name = SERVICE_OPERATION_ERROR_NAME;
  Object.assign(error, fields);
  return error;
}

describe('isApiKeyLimitReached', () => {
  it('recognizes the API key cap by its title', () => {
    const error = operationError(
      'You have reached the maximum number of API keys (10).',
      { category: 'API Key Limit Reached', status: 400 },
    );

    expect(isApiKeyLimitReached(error)).toBe(true);
  });

  it('recognizes the cap when only the server detail is present', () => {
    const error = operationError(
      'You have reached the maximum number of API keys (10).',
      { status: 400 },
    );

    expect(isApiKeyLimitReached(error)).toBe(true);
  });

  it('leaves other client errors reportable', () => {
    const error = operationError('Label is required.', {
      category: 'Validation failed',
      status: 400,
    });

    expect(isApiKeyLimitReached(error)).toBe(false);
  });

  it('leaves server failures reportable', () => {
    const error = operationError(
      'You have reached the maximum number of API keys (10).',
      { category: 'API Key Limit Reached', status: 500 },
    );

    expect(isApiKeyLimitReached(error)).toBe(false);
    expect(isApiKeyLimitReached(new Error('maximum number of API keys'))).toBe(
      false,
    );
  });
});
