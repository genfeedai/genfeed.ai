import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { IDesktopEnvironment } from '@genfeedai/desktop-contracts';
import type { DesktopKvService } from './kv.service';
import './test-support/electron.mock';

const { DesktopSessionService } = await import('./session.service');

const TEST_ENVIRONMENT: IDesktopEnvironment = {
  apiEndpoint: 'https://api.genfeed.ai/v1',
  appEndpoint: 'https://app.genfeed.ai',
  appName: 'desktop',
  appPort: 3230,
  authEndpoint: 'https://app.genfeed.ai/oauth/cli',
  cdnUrl: 'https://cdn.genfeed.ai',
  wsEndpoint: 'https://notifications.genfeed.ai',
};

const createKvMock = () => {
  const values = new Map<string, string>();

  return {
    deleteValue: async (key: string) => {
      values.delete(key);
    },
    getValue: async (key: string) => values.get(key) ?? null,
    getValueSync: (key: string) => values.get(key) ?? null,
    setValue: async (key: string, value: string) => {
      values.set(key, value);
    },
    setValueSync: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  } as unknown as DesktopKvService & { values: Map<string, string> };
};

const createSessionService = (
  kvService: DesktopKvService,
): InstanceType<typeof DesktopSessionService> =>
  new DesktopSessionService(kvService, TEST_ENVIRONMENT);

describe('DesktopSessionService', () => {
  const originalFetch = globalThis.fetch;
  let kvService: ReturnType<typeof createKvMock>;

  beforeEach(() => {
    kvService = createKvMock();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('builds a desktop-specific OAuth URL', () => {
    const service = createSessionService(kvService);

    const loginUrl = new URL(service.getLoginUrl());

    expect(loginUrl.origin).toBe('https://app.genfeed.ai');
    expect(loginUrl.pathname).toBe('/oauth/cli');
    expect(loginUrl.searchParams.get('desktop')).toBe('1');
    expect(loginUrl.searchParams.get('return_to')).toBe(
      'genfeedai-desktop://auth',
    );
  });

  it('hydrates a session from the server-minted key', async () => {
    const service = createSessionService(kvService);

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe('https://api.genfeed.ai/v1/auth/whoami');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer gf_desktop_key',
      });

      return new Response(
        JSON.stringify({
          data: {
            user: {
              email: 'desktop@example.com',
              id: 'user-123',
              name: 'Desktop User',
            },
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      );
    }) as typeof fetch;

    const session = await service.handleCallback(
      'genfeedai-desktop://auth?key=gf_desktop_key',
    );

    expect(session).toEqual({
      issuedAt: expect.any(String),
      token: 'gf_desktop_key',
      userEmail: 'desktop@example.com',
      userId: 'user-123',
      userName: 'Desktop User',
    });
    expect(kvService.values.get('desktop.session')).toContain('gf_desktop_key');
    expect(service.getSession()?.token).toBe('gf_desktop_key');
  });

  it('exchanges browser auth codes with the stored PKCE verifier', async () => {
    const service = createSessionService(kvService);
    const loginUrl = new URL(service.getLoginUrl());
    const state = loginUrl.searchParams.get('state');

    if (!state) {
      throw new Error('Expected login URL state');
    }

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        'https://api.genfeed.ai/v1/auth/desktop/exchange',
      );
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        code: 'desktop-code',
        codeVerifier: expect.any(String),
        state,
      });

      return new Response(
        JSON.stringify({
          issuedAt: '2026-05-01T10:00:00.000Z',
          token: 'gf_desktop_key',
          userEmail: 'desktop@example.com',
          userId: 'user-123',
          userName: 'Desktop User',
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      );
    }) as typeof fetch;

    const session = await service.handleCallback(
      `genfeedai-desktop://auth?code=desktop-code&state=${state}`,
    );

    expect(session).toEqual({
      issuedAt: '2026-05-01T10:00:00.000Z',
      token: 'gf_desktop_key',
      userEmail: 'desktop@example.com',
      userId: 'user-123',
      userName: 'Desktop User',
    });
    expect(kvService.values.get('desktop.session')).toContain('gf_desktop_key');
  });

  it('validates and refreshes an existing desktop session on startup', async () => {
    const service = createSessionService(kvService);

    await service.setSession({
      issuedAt: '2026-04-01T09:00:00.000Z',
      token: 'persisted_desktop_key',
      userEmail: 'old@example.com',
      userId: 'user-123',
      userName: 'Old Name',
    });

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe('https://api.genfeed.ai/v1/auth/whoami');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer persisted_desktop_key',
      });

      return new Response(
        JSON.stringify({
          data: {
            user: {
              email: 'desktop@example.com',
              id: 'user-123',
              name: 'Desktop User',
            },
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      );
    }) as typeof fetch;

    await expect(service.validateStoredSession()).resolves.toEqual({
      issuedAt: '2026-04-01T09:00:00.000Z',
      token: 'persisted_desktop_key',
      userEmail: 'desktop@example.com',
      userId: 'user-123',
      userName: 'Desktop User',
    });
    expect(service.getSession()).toEqual({
      issuedAt: '2026-04-01T09:00:00.000Z',
      token: 'persisted_desktop_key',
      userEmail: 'desktop@example.com',
      userId: 'user-123',
      userName: 'Desktop User',
    });
  });

  it('rejects callbacks without a key', async () => {
    const service = createSessionService(kvService);

    await expect(
      service.handleCallback('genfeedai-desktop://auth?token=missing'),
    ).resolves.toBeNull();
  });

  it('clears a stale stored desktop session during startup validation', async () => {
    const service = createSessionService(kvService);

    await service.setSession({
      issuedAt: '2026-04-01T09:00:00.000Z',
      token: 'stale_desktop_key',
      userEmail: 'desktop@example.com',
      userId: 'user-123',
      userName: 'Desktop User',
    });

    globalThis.fetch = (async () => {
      return new Response('unauthorized', { status: 401 });
    }) as typeof fetch;

    await expect(service.validateStoredSession()).resolves.toBeNull();
    expect(service.getSession()).toBeNull();
    expect(kvService.values.has('desktop.session')).toBe(false);
  });
});
