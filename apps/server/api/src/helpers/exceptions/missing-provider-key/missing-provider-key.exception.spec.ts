import {
  MISSING_PROVIDER_KEY_CODE,
  MissingProviderKeyException,
} from '@api/helpers/exceptions/missing-provider-key/missing-provider-key.exception';
import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('MissingProviderKeyException', () => {
  it('names the missing environment variable in a 503 response', () => {
    const exception = new MissingProviderKeyException(
      'OpenRouter',
      'OPENROUTER_API_KEY',
    );

    expect(exception).toBeInstanceOf(HttpException);
    expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(exception.message).toBe('Missing provider key: OPENROUTER_API_KEY');
    expect(exception.getResponse()).toMatchObject({
      code: MISSING_PROVIDER_KEY_CODE,
      message: 'Missing provider key: OPENROUTER_API_KEY',
      meta: { envVar: 'OPENROUTER_API_KEY', provider: 'OpenRouter' },
      title: 'Missing provider key',
    });
    expect(exception.envVar).toBe('OPENROUTER_API_KEY');
    expect(exception.provider).toBe('OpenRouter');
  });

  it('tells the operator how to fix it', () => {
    const body = new MissingProviderKeyException(
      'OpenRouter',
      'OPENROUTER_API_KEY',
    ).getResponse() as { detail: string };

    expect(body.detail).toContain('server environment');
    expect(body.detail).toContain('Organization settings');
  });
});
