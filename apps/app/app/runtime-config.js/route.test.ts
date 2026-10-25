import * as authConfig from '@genfeedai/auth-client/server';
import { connection } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));

beforeEach(() => {
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', undefined);
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete globalThis.__GENFEED_RUNTIME_CONFIG__;
});

describe('self-hosted runtime config', () => {
  it.each(['true', 'false'])(
    'reads runtime env %s while ignoring the existing runtime global',
    async (flag) => {
      vi.stubEnv('BETTER_AUTH_ENABLED', flag);
      vi.stubEnv('RESEND_API_KEY', 're_test_key');
      vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'google-client-id');
      vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'google-client-secret');
      vi.stubEnv(
        'NEXT_PUBLIC_BETTER_AUTH_ENABLED',
        flag === 'true' ? 'false' : 'true',
      );
      globalThis.__GENFEED_RUNTIME_CONFIG__ = {
        betterAuthEnabled: flag !== 'true',
      };

      const response = await GET();
      const source = await response.text();
      expect(connection).toHaveBeenCalled();
      expect(source).toContain(`"betterAuthEnabled":${flag}`);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Type')).toBe(
        'application/javascript; charset=utf-8',
      );

      const fakeGlobal = {
        __GENFEED_RUNTIME_CONFIG__: {
          apiEndpoint: '/v1',
          clientSurface: 'desktop',
          betterAuthEnabled: false,
        },
      };
      new Function('globalThis', source)(fakeGlobal);
      expect(fakeGlobal.__GENFEED_RUNTIME_CONFIG__).toEqual({
        apiEndpoint: '/v1',
        clientSurface: 'desktop',
        betterAuthEnabled: flag === 'true',
        isGoogleSignInAvailable: true,
        isMagicLinkAvailable: true,
      });
    },
  );

  it.each([
    { expected: false, key: '' },
    { expected: true, key: 're_abc123' },
  ])(
    'reports magic links available=$expected for RESEND_API_KEY=$key on self-hosted',
    async ({ expected, key }) => {
      vi.stubEnv('RESEND_API_KEY', key);

      const source = await (await GET()).text();

      expect(source).toContain(`"isMagicLinkAvailable":${expected}`);
    },
  );

  it.each([
    { expected: false, id: undefined, secret: undefined },
    { expected: false, id: '', secret: '' },
    { expected: false, id: 'google-client-id', secret: '' },
    { expected: false, id: '', secret: 'google-client-secret' },
    { expected: false, id: ' ', secret: 'google-client-secret' },
    { expected: false, id: 'google-client-id', secret: ' ' },
    {
      expected: true,
      id: ' google-client-id ',
      secret: ' google-client-secret ',
    },
  ])(
    'reports Google sign-in available=$expected for client id=$id secret=$secret on self-hosted',
    async ({ expected, id, secret }) => {
      vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', id);
      vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', secret);

      globalThis.__GENFEED_RUNTIME_CONFIG__ = {
        isGoogleSignInAvailable: !expected,
      };
      const source = await (await GET()).text();
      const runtimeGlobal = { __GENFEED_RUNTIME_CONFIG__: {} };
      new Function('globalThis', source)(runtimeGlobal);
      expect(runtimeGlobal.__GENFEED_RUNTIME_CONFIG__).toMatchObject({
        isGoogleSignInAvailable: expected,
      });
      expect(source).not.toContain('google-client-id');
      expect(source).not.toContain('google-client-secret');
      expect(source).not.toContain('GOOGLE_OAUTH');
    },
  );

  it('reflects credential changes between requests without a build or restart', async () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-client-id');
    expect(await (await GET()).text()).toContain(
      '"isGoogleSignInAvailable":false',
    );
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');
    expect(await (await GET()).text()).toContain(
      '"isGoogleSignInAvailable":true',
    );
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', ' ');
    expect(await (await GET()).text()).toContain(
      '"isGoogleSignInAvailable":false',
    );
  });

  it('escapes less-than characters in the serialized payload', async () => {
    // A synthetic value exercises escaping even though the real helper returns a boolean.
    vi.spyOn(authConfig, 'readBetterAuthEnabledFromEnv').mockReturnValue(
      '</script>' as unknown as boolean,
    );

    const source = await (await GET()).text();
    expect(source).toContain('\\u003c/script>');
    expect(source).not.toContain('<');
  });
});
