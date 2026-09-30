import { describe, expect, it } from 'vitest';
import {
  REDACTED_VALUE,
  redactSensitiveString,
  redactSensitiveValue,
} from './redact-sensitive-value.helper';

describe('redactSensitiveValue', () => {
  it('redacts sensitive keys and credentials embedded in strings', () => {
    expect(
      redactSensitiveValue({
        apiKey: 'sk-private',
        codeVerifier: 'oauth-verifier',
        nested: {
          authorization: 'Bearer sk-private',
          callback:
            'https://example.com/callback?access_token=secret-value&safe=1',
          oauthTokenSecret: 'oauth-secret',
          webhookSecretEncrypted: 'encrypted-webhook-secret',
        },
      }),
    ).toEqual({
      apiKey: REDACTED_VALUE,
      codeVerifier: REDACTED_VALUE,
      nested: {
        authorization: REDACTED_VALUE,
        callback: `https://example.com/callback?access_token=${REDACTED_VALUE}&safe=1`,
        oauthTokenSecret: REDACTED_VALUE,
        webhookSecretEncrypted: REDACTED_VALUE,
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

  it.each(['', 'RSA ', 'EC '])(
    'redacts complete %sprivate key blocks',
    (keyType) => {
      const beginMarker = ['-----BEGIN ', keyType, 'PRIVATE KEY-----'].join('');
      const endMarker = ['-----END ', keyType, 'PRIVATE KEY-----'].join('');
      const value = [beginMarker, 'private-material', endMarker].join('\n');

      expect(redactSensitiveString(`before ${value} after`)).toBe(
        `before ${REDACTED_VALUE} after`,
      );
    },
  );

  it('preserves an incomplete private key marker like the previous matcher', () => {
    const value = ['-----BEGIN ', 'PRIVATE KEY-----\ntruncated'].join('');
    expect(redactSensitiveString(value)).toBe(value);
  });

  it('handles repeated unmatched begin markers without ambiguous matching', () => {
    const marker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const value = marker.repeat(20_000);

    expect(redactSensitiveString(value)).toBe(value);
  });
  it('preserves a begin marker that is not a private key type', () => {
    const value = '-----BEGIN rsa PRIVATE KEY-----\nmaterial';
    expect(redactSensitiveString(value)).toBe(value);
  });

  it('preserves an unmatched begin marker until a valid end marker exists', () => {
    const beginMarker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const value = `before ${beginMarker}\nmaterial`;
    expect(redactSensitiveString(value)).toBe(value);
  });

  it('ignores an end marker that is not a private key type', () => {
    const beginMarker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const invalidEnd = ['-----END ', 'rsa PRIVATE KEY-----'].join('');
    const value = [beginMarker, 'material', invalidEnd].join('\n');
    expect(redactSensitiveString(value)).toBe(value);
  });
});
