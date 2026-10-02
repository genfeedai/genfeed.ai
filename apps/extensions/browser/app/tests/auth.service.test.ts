import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  fetch: vi.fn(),
}));
vi.mock('@plasmohq/storage', () => ({
  Storage: class Storage {
    async get<T>(key: string): Promise<T | undefined> {
      return mocks.values.get(key) as T | undefined;
    }
    async remove(key: string) {
      mocks.values.delete(key);
    }
    async set(key: string, value: unknown) {
      mocks.values.set(key, value);
    }
  },
}));
const originalEnv = { ...process.env };
const context = {
  user: { id: 'user-1', email: 'vincent@example.com' },
  organization: { id: 'org-1' },
  scopes: [],
  isApiKey: false,
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
const endpoint = 'https://api.genfeed.ai/v1/auth/';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.values.clear();
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
  vi.mocked(chrome.cookies.get).mockImplementation((_details, callback) => {
    callback?.(null);
    return undefined as never;
  });
  process.env = { ...originalEnv, PLASMO_PUBLIC_ENV: 'production' };
  delete process.env.PLASMO_PUBLIC_APP_ENDPOINT;
  delete process.env.PLASMO_PUBLIC_API_ENDPOINT;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  process.env = { ...originalEnv };
});

describe('extension API authentication', () => {
  it('exchanges the browser session for an API JWT instead of using a cookie value as Bearer', async () => {
    mocks.fetch.mockResolvedValue(response({ token: 'fresh-api-jwt' }));
    const { authService } = await import('../src/services/auth.service');
    expect(await authService.getToken()).toBe('fresh-api-jwt');
    expect(mocks.fetch).toHaveBeenCalledWith(
      `${endpoint}token`,
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
    expect(chrome.cookies.get).not.toHaveBeenCalled();
    expect(mocks.values.get('genfeed_token')).toBe('fresh-api-jwt');
  });
  it('retains a valid stored credential without requiring the web session', async () => {
    mocks.values.set('genfeed_token', 'existing-api-key');
    mocks.fetch.mockResolvedValue(response({ data: context }));
    const { authService } = await import('../src/services/auth.service');
    expect(await authService.getAuthContext(true)).toEqual(context);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(
      new Headers(mocks.fetch.mock.calls[0][1].headers).get('Authorization'),
    ).toBe('Bearer existing-api-key');
  });
  it('recovers a legacy session credential on 401 and validates the refreshed identity', async () => {
    mocks.values.set('genfeed_token', 'legacy-session-cookie');
    mocks.fetch
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ token: 'fresh-jwt' }))
      .mockResolvedValueOnce(response({ data: context }));
    const { authService } = await import('../src/services/auth.service');
    expect(await authService.getAuthContext(true)).toEqual(context);
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual([
      `${endpoint}whoami`,
      `${endpoint}token`,
      `${endpoint}whoami`,
    ]);
    expect(
      new Headers(mocks.fetch.mock.calls[2][1].headers).get('Authorization'),
    ).toBe('Bearer fresh-jwt');
  });
  it('refreshes expired JWTs before a background request', async () => {
    mocks.values.set(
      'genfeed_token',
      `header.${btoa(JSON.stringify({ exp: Date.now() / 1000 - 1 }))}.signature`,
    );
    mocks.fetch.mockResolvedValue(response({ token: 'fresh-jwt' }));
    const { authService } = await import('../src/services/auth.service');
    expect(await authService.getToken()).toBe('fresh-jwt');
  });
  it('observes another extension context updating the credential and invalidates cached identity', async () => {
    mocks.values.set('genfeed_token', 'token-1');
    mocks.fetch
      .mockResolvedValueOnce(response({ data: context }))
      .mockResolvedValueOnce(
        response({ data: { ...context, organization: { id: 'org-2' } } }),
      );
    const { authService } = await import('../src/services/auth.service');
    await authService.getAuthContext();
    mocks.values.set('genfeed_token', 'token-2');
    expect((await authService.getAuthContext())?.organization.id).toBe('org-2');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it('validates workspace identity instead of trusting persisted context', async () => {
    mocks.values.set('genfeed_token', 'token-1');
    mocks.values.set('genfeed_auth_context', {
      ...context,
      organization: { id: 'stale-org' },
    });
    mocks.fetch.mockResolvedValue(response({ data: context }));
    const { authService } = await import('../src/services/auth.service');
    expect((await authService.getAuthContext())?.organization.id).toBe('org-1');
  });
  it('shares one session exchange between concurrent consumers', async () => {
    mocks.fetch.mockResolvedValue(response({ token: 'fresh-jwt' }));
    const { authService } = await import('../src/services/auth.service');
    expect(
      await Promise.all([authService.getToken(), authService.getToken()]),
    ).toEqual(['fresh-jwt', 'fresh-jwt']);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it('reports unavailable API without clearing the credential', async () => {
    mocks.values.set('genfeed_token', 'token-1');
    mocks.fetch.mockResolvedValue(response({}, 503));
    const { authService } = await import('../src/services/auth.service');
    await expect(authService.getAuthContext(true)).rejects.toThrow('503');
    expect(mocks.values.get('genfeed_token')).toBe('token-1');
  });
  it('reports access denied separately without renewing on 403', async () => {
    mocks.values.set('genfeed_token', 'token-1');
    mocks.fetch.mockResolvedValue(response({}, 403));
    const { authService } = await import('../src/services/auth.service');
    await expect(authService.getAuthContext(true)).rejects.toThrow('access');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.values.get('genfeed_token')).toBe('token-1');
  });
  it('asks for sign-in when a rejected credential cannot be renewed', async () => {
    mocks.values.set('genfeed_token', 'rejected-token');
    mocks.fetch.mockResolvedValue(response({}, 401));
    const { authService } = await import('../src/services/auth.service');
    await expect(authService.getAuthContext(true)).rejects.toThrow('Sign in');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.values.has('genfeed_token')).toBe(false);
  });
  it('never loops if the freshly minted JWT is also rejected', async () => {
    mocks.values.set('genfeed_token', 'rejected-token');
    mocks.fetch
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ token: 'also-rejected' }))
      .mockResolvedValueOnce(response({}, 401));
    const { authService } = await import('../src/services/auth.service');
    await expect(authService.getAuthContext(true)).rejects.toThrow('Sign in');
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });
  it('distinguishes a valid session without a workspace from account onboarding', async () => {
    mocks.values.set('genfeed_token', 'token-1');
    mocks.fetch.mockResolvedValue(
      response({ data: { ...context, organization: { id: '' } } }),
    );
    const { authService } = await import('../src/services/auth.service');
    await expect(authService.getAuthContext(true)).rejects.toThrow(
      'active workspace',
    );
    expect(mocks.values.get('genfeed_token')).toBe('token-1');
  });
  it('does not silently replace an explicit API key with another browser account', async () => {
    mocks.values.set('genfeed_token', 'gf_test_invalid_fixture');
    mocks.fetch.mockResolvedValue(response({}, 401));
    const { authService } = await import('../src/services/auth.service');
    await expect(authService.getAuthContext(true)).rejects.toThrow('API key');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves credentials on a connection failure so a later retry can work', async () => {
    mocks.values.set('genfeed_token', 'token-1');
    mocks.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const { authService } = await import('../src/services/auth.service');
    await expect(authService.getAuthContext(true)).rejects.toThrow(
      'Failed to fetch',
    );
    expect(mocks.values.get('genfeed_token')).toBe('token-1');
    mocks.fetch.mockResolvedValue(response({ data: context }));
    expect(await authService.getAuthContext(true)).toEqual(context);
  });

  it('inspects the configured app cookie origin for diagnostics', async () => {
    process.env.PLASMO_PUBLIC_ENV = 'development';
    const { authService } = await import('../src/services/auth.service');
    authService.debugCookies();
    expect(chrome.cookies.getAll).toHaveBeenCalledWith(
      { url: 'https://app.genfeed.localhost' },
      expect.any(Function),
    );
  });
});

describe('authoritative cookie refresh on focus', () => {
  it.each([401, 403])(
    'clears the old user JWT after confirmed cookie rejection %s',
    async (status) => {
      mocks.values.set('genfeed_token', 'old-user-jwt');
      mocks.fetch.mockResolvedValue(response({}, status));
      const { authService } = await import('../src/services/auth.service');
      expect(await authService.refreshSessionToken()).toBeNull();
      expect(mocks.values.has('genfeed_token')).toBe(false);
    },
  );
  it('preserves the old credential on server failure', async () => {
    mocks.values.set('genfeed_token', 'old-user-jwt');
    mocks.fetch.mockResolvedValue(response({}, 503));
    const { authService } = await import('../src/services/auth.service');
    await expect(authService.refreshSessionToken()).rejects.toThrow('503');
    expect(mocks.values.get('genfeed_token')).toBe('old-user-jwt');
  });
  it('never exchanges an explicit API key for the cookie account', async () => {
    mocks.values.set('genfeed_token', 'gf_fixture_key');
    const { authService } = await import('../src/services/auth.service');
    expect(await authService.refreshSessionToken()).toBe('gf_fixture_key');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('scoped authenticated send and replay fence', () => {
  it('does not send a mutation after another surface changes to a different user in the same organization', async () => {
    mocks.values.set('genfeed_token', 'different-account-token');
    mocks.fetch.mockResolvedValueOnce(
      response({ data: { ...context, user: { id: 'different-user' } } }),
    );
    const { authService } = await import('../src/services/auth.service');
    await expect(
      authService.makeAuthenticatedRequest(
        `${endpoint}mutation`,
        { method: 'POST' },
        (verified) => {
          if (verified.user.id !== context.user.id)
            throw new Error('Account changed');
        },
      ),
    ).rejects.toThrow('Account changed');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(
      mocks.fetch.mock.calls.filter((call) => call[1].method === 'POST'),
    ).toHaveLength(0);
  });
  it('does not replay a mutation as a different user in the same organization', async () => {
    mocks.values.set('genfeed_token', 'old');
    mocks.fetch
      .mockResolvedValueOnce(response({ data: context }))
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ token: 'new' }))
      .mockResolvedValueOnce(
        response({ data: { ...context, user: { id: 'different-user' } } }),
      );
    const { authService } = await import('../src/services/auth.service');
    await expect(
      authService.makeAuthenticatedRequest(
        `${endpoint}mutation`,
        { method: 'POST' },
        (verified) => {
          if (verified.user.id !== context.user.id)
            throw new Error('Account changed');
        },
      ),
    ).rejects.toThrow('Account changed');
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    expect(
      mocks.fetch.mock.calls.filter((call) => call[1].method === 'POST'),
    ).toHaveLength(1);
    expect(mocks.values.get('genfeed_token')).toBe('new');
  });
  it('verifies the exact captured token before initial send and a single same-scope replay', async () => {
    mocks.values.set('genfeed_token', 'old');
    mocks.fetch
      .mockResolvedValueOnce(response({ data: context }))
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ token: 'new' }))
      .mockResolvedValueOnce(response({ data: context }))
      .mockResolvedValueOnce(response({ success: true }));
    const guard = vi.fn();
    const { authService } = await import('../src/services/auth.service');
    expect(
      (
        await authService.makeAuthenticatedRequest(
          `${endpoint}mutation`,
          { method: 'POST' },
          guard,
        )
      ).ok,
    ).toBe(true);
    expect(guard).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(5);
    expect(
      mocks.fetch.mock.calls.filter((call) => call[1].method === 'POST'),
    ).toHaveLength(2);
  });
  it.each([401, 403])(
    'blocks replay after refreshed identity rejection %s',
    async (status) => {
      mocks.values.set('genfeed_token', 'old');
      mocks.fetch
        .mockResolvedValueOnce(response({ data: context }))
        .mockResolvedValueOnce(response({}, 401))
        .mockResolvedValueOnce(response({ token: 'new' }))
        .mockResolvedValueOnce(response({}, status));
      const { authService } = await import('../src/services/auth.service');
      await expect(
        authService.makeAuthenticatedRequest(
          `${endpoint}mutation`,
          { method: 'POST' },
          vi.fn(),
        ),
      ).rejects.toThrow('no longer has access');
      expect(
        mocks.fetch.mock.calls.filter((call) => call[1].method === 'POST'),
      ).toHaveLength(1);
    },
  );
  it('refreshes initial identity401 once before sending the mutation', async () => {
    mocks.values.set('genfeed_token', 'old');
    mocks.fetch
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ token: 'new' }))
      .mockResolvedValueOnce(response({ data: context }))
      .mockResolvedValueOnce(response({ success: true }));
    const { authService } = await import('../src/services/auth.service');
    expect(
      (
        await authService.makeAuthenticatedRequest(
          `${endpoint}mutation`,
          { method: 'POST' },
          vi.fn(),
        )
      ).ok,
    ).toBe(true);
    expect(
      mocks.fetch.mock.calls.filter((call) => call[1].method === 'POST'),
    ).toHaveLength(1);
    expect(
      mocks.fetch.mock.calls.filter((call) =>
        String(call[0]).endsWith('/auth/token'),
      ),
    ).toHaveLength(1);
  });
  it('does not refresh again when the protected request rejects the initially refreshed identity', async () => {
    mocks.values.set('genfeed_token', 'old');
    mocks.fetch
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ token: 'new' }))
      .mockResolvedValueOnce(response({ data: context }))
      .mockResolvedValueOnce(response({}, 401));
    const { authService } = await import('../src/services/auth.service');
    await expect(
      authService.makeAuthenticatedRequest(
        `${endpoint}mutation`,
        { method: 'POST' },
        vi.fn(),
      ),
    ).rejects.toThrow('expired');
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    expect(
      mocks.fetch.mock.calls.filter((call) =>
        String(call[0]).endsWith('/auth/token'),
      ),
    ).toHaveLength(1);
  });
  it('does not cookie-refresh an initial identity403', async () => {
    mocks.values.set('genfeed_token', 'old');
    mocks.fetch.mockResolvedValueOnce(response({}, 403));
    const { authService } = await import('../src/services/auth.service');
    await expect(
      authService.makeAuthenticatedRequest(
        `${endpoint}mutation`,
        { method: 'POST' },
        vi.fn(),
      ),
    ).rejects.toThrow('no longer has access');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.values.get('genfeed_token')).toBe('old');
  });
});
