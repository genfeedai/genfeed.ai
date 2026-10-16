import {
  accountGenerationErrorCode,
  accountGenerationFailure,
} from '@api/collections/posts/services/post-account-generation-reason.util';
import { MissingProviderKeyException } from '@api/helpers/exceptions/missing-provider-key/missing-provider-key.exception';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('post account generation reasons', () => {
  it('keeps a missing provider key as a stable code, not the long message', () => {
    const error = new MissingProviderKeyException(
      'OpenRouter',
      'OPENROUTER_API_KEY',
    );

    expect(accountGenerationErrorCode(error)).toBe('missing_provider_key');
  });

  it('tells the user which key is missing', () => {
    const failure = accountGenerationFailure('missing_provider_key');

    expect(failure.code).toBe('missing_provider_key');
    expect(failure.message).toContain('OPENROUTER_API_KEY');
    expect(failure.message).toContain('server environment');
  });

  it('still reads other HTTP exceptions by their message', () => {
    expect(
      accountGenerationErrorCode(
        new BadRequestException('branded_request_key_required'),
      ),
    ).toBe('branded_request_key_required');
    expect(accountGenerationErrorCode(new Error('boom'))).toBe(
      'generation_failed',
    );
  });
});
