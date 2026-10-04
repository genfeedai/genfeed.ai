import { describe, expect, it } from 'vitest';
import {
  REDACTED_CIRCULAR_VALUE,
  REDACTED_TRUNCATED_VALUE,
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

  describe('totality', () => {
    it('handles circular references and keeps secrets redacted', () => {
      const node: Record<string, unknown> = {
        password: 'hunter2',
        note: 'api_key=abc123456789',
      };
      node.self = node;
      node.list = [node];

      const result = redactSensitiveValue(node) as Record<string, unknown>;

      expect(result.password).toBe(REDACTED_VALUE);
      expect(result.note).toBe(`api_key=${REDACTED_VALUE}`);
      expect(result.self).toBe(REDACTED_CIRCULAR_VALUE);
      expect(result.list).toEqual([REDACTED_CIRCULAR_VALUE]);
      expect(JSON.stringify(result)).not.toContain('hunter2');
    });

    it('does not overflow the stack on a 10k-deep nested array', () => {
      let deep: unknown = 'Bearer sk-secretsecretsecret';
      for (let i = 0; i < 10_000; i += 1) {
        deep = [deep];
      }

      let result: unknown;
      expect(() => {
        result = redactSensitiveValue(deep);
      }).not.toThrow();
      expect(JSON.stringify(result)).toContain(REDACTED_TRUNCATED_VALUE);
      expect(JSON.stringify(result)).not.toContain('sk-secretsecret');
    });

    it('summarizes Axios-style errors without traversing sockets or requests', () => {
      const socket: Record<string, unknown> = { token: 'socket-token' };
      socket.parser = { socket };
      const request = { socket };
      const error = Object.assign(
        new Error('Request failed with token=abc12345'),
        {
          code: 'ERR_BAD_REQUEST',
          config: {
            headers: { Authorization: 'Bearer live-secret' },
            method: 'get',
            url: 'https://open.tiktokapis.com/v2/video/list/?access_token=leak',
          },
          isAxiosError: true,
          request,
          response: { data: { error: 'denied' }, request, status: 401 },
          status: 401,
        },
      );

      const result = redactSensitiveValue(error) as Record<string, unknown>;
      const serialized = JSON.stringify(result);

      expect(result.message).toBe(
        `Request failed with token=${REDACTED_VALUE}`,
      );
      expect(result.code).toBe('ERR_BAD_REQUEST');
      expect(result.status).toBe(401);
      expect(result.response).toEqual({
        data: { error: 'denied' },
        status: 401,
      });
      expect(result).not.toHaveProperty('request.socket');
      expect(serialized).not.toContain('live-secret');
      expect(serialized).not.toContain('socket-token');
      expect(serialized).not.toContain('access_token=leak');
    });

    it('summarizes buffers instead of expanding them', () => {
      expect(redactSensitiveValue({ body: Buffer.from('secret') })).toEqual({
        body: '[Binary 6 bytes]',
      });
    });
  });
});
