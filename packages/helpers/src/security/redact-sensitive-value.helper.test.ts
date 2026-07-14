import { describe, expect, it } from 'vitest';
import {
  REDACTED_VALUE,
  redactSensitiveValue,
} from './redact-sensitive-value.helper';

describe('redactSensitiveValue', () => {
  it('redacts sensitive keys and credentials embedded in strings', () => {
    expect(
      redactSensitiveValue({
        apiKey: 'sk-private',
        nested: {
          authorization: 'Bearer sk-private',
          callback:
            'https://example.com/callback?access_token=secret-value&safe=1',
        },
      }),
    ).toEqual({
      apiKey: REDACTED_VALUE,
      nested: {
        authorization: REDACTED_VALUE,
        callback: `https://example.com/callback?access_token=${REDACTED_VALUE}&safe=1`,
      },
    });
  });

  it('redacts inline assignments and provider-shaped tokens', () => {
    const providerToken = ['sk', 'proj', '1234567890abcdef'].join('-');
    const githubToken = ['ghp', '1234567890abcdef'].join('_');

    expect(
      redactSensitiveValue(
        `Provider failed: api_key=${providerToken} and ${githubToken}`,
      ),
    ).toBe(`Provider failed: api_key=${REDACTED_VALUE} and ${REDACTED_VALUE}`);
  });

  it('preserves non-sensitive scalar values and array structure', () => {
    expect(
      redactSensitiveValue({ attempts: 2, models: ['gpt-5', 'claude'] }),
    ).toEqual({ attempts: 2, models: ['gpt-5', 'claude'] });
  });
});
