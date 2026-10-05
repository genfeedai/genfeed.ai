import * as authConfig from '@genfeedai/auth-client/server';
import { JSDOM } from 'jsdom';
import { connection } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));

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

      const dom = new JSDOM('', { runScripts: 'outside-only' });
      dom.window.eval(
        'globalThis.__GENFEED_RUNTIME_CONFIG__={apiEndpoint:"/v1",clientSurface:"desktop",betterAuthEnabled:false};',
      );
      dom.window.eval(source);
      expect(dom.window.eval('globalThis.__GENFEED_RUNTIME_CONFIG__')).toEqual({
        apiEndpoint: '/v1',
        clientSurface: 'desktop',
        betterAuthEnabled: flag === 'true',
      });
      dom.window.close();
    },
  );

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
