import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('better-auth/client/plugins', () => ({
  jwtClient: vi.fn(() => 'jwt-plugin'),
  magicLinkClient: vi.fn(() => 'magic-link-plugin'),
}));

vi.mock('better-auth/react', () => ({
  createAuthClient: vi.fn(() => ({
    $fetch: fetchMock,
    getSession: vi.fn(),
    signIn: {},
    signOut: vi.fn(),
    signUp: {},
    useSession: vi.fn(),
  })),
}));

import {
  clearBetterAuthTokenCache,
  getBetterAuthToken,
  getBetterAuthTokenContextKey,
  signOut,
} from './client';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createJwt(exp: number): string {
  const encode = (value: object): string =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp })}.signature`;
}

describe('getBetterAuthToken', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    clearBetterAuthTokenCache();
  });

  it('reads a direct token response from Better Auth fetch', async () => {
    fetchMock.mockResolvedValue({ token: 'direct-token' });

    await expect(getBetterAuthToken()).resolves.toBe('direct-token');
  });

  it('reads a nested data token response for wrapped fetch clients', async () => {
    fetchMock.mockResolvedValue({ data: { token: 'nested-token' } });

    await expect(getBetterAuthToken()).resolves.toBe('nested-token');
  });

  it('returns null when the token endpoint has no active session token', async () => {
    fetchMock.mockResolvedValue({ data: null });

    await expect(getBetterAuthToken()).resolves.toBeNull();
  });

  it('coalesces a protected-route burst into one token exchange', async () => {
    const deferred = createDeferred<{ token: string }>();
    fetchMock.mockReturnValue(deferred.promise);

    const callers = Array.from({ length: 64 }, () =>
      getBetterAuthToken('session-1:user-1:org-1'),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    deferred.resolve({ token: 'shared-token' });

    await expect(Promise.all(callers)).resolves.toEqual(
      Array.from({ length: 64 }, () => 'shared-token'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reuses a valid cached token within its safe lifetime', async () => {
    fetchMock.mockResolvedValue({ token: 'cached-token' });

    await expect(getBetterAuthToken('session-1:user-1:org-1')).resolves.toBe(
      'cached-token',
    );
    await expect(getBetterAuthToken('session-1:user-1:org-1')).resolves.toBe(
      'cached-token',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a token close to its JWT expiry', async () => {
    const expiringToken = createJwt(Math.floor(Date.now() / 1000) + 1);
    const freshToken = createJwt(Math.floor(Date.now() / 1000) + 120);
    fetchMock
      .mockResolvedValueOnce({ token: expiringToken })
      .mockResolvedValueOnce({ token: freshToken });

    await getBetterAuthToken('session-1:user-1:org-1');
    await expect(getBetterAuthToken('session-1:user-1:org-1')).resolves.toBe(
      freshToken,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('isolates cached tokens by authenticated session and organization', async () => {
    const firstContext = getBetterAuthTokenContextKey({
      organizationId: 'org-1',
      sessionId: 'session-1',
      userId: 'user-1',
    });
    const nextSessionContext = getBetterAuthTokenContextKey({
      organizationId: 'org-1',
      sessionId: 'session-2',
      userId: 'user-1',
    });
    const nextOrganizationContext = getBetterAuthTokenContextKey({
      organizationId: 'org-2',
      sessionId: 'session-2',
      userId: 'user-1',
    });
    fetchMock
      .mockResolvedValueOnce({ token: 'session-1-token' })
      .mockResolvedValueOnce({ token: 'session-2-token' })
      .mockResolvedValueOnce({ token: 'org-2-token' });

    await expect(getBetterAuthToken(firstContext)).resolves.toBe(
      'session-1-token',
    );
    await expect(getBetterAuthToken(nextSessionContext)).resolves.toBe(
      'session-2-token',
    );
    await expect(getBetterAuthToken(nextOrganizationContext)).resolves.toBe(
      'org-2-token',
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('invalidates cached and in-flight tokens for an auth context', async () => {
    const firstExchange = createDeferred<{ token: string }>();
    fetchMock
      .mockReturnValueOnce(firstExchange.promise)
      .mockResolvedValueOnce({ token: 'replacement-token' });

    const invalidated = getBetterAuthToken('session-1:user-1:org-1');
    clearBetterAuthTokenCache('session-1:user-1:org-1');
    firstExchange.resolve({ token: 'invalidated-token' });

    await expect(invalidated).resolves.toBeNull();
    await expect(getBetterAuthToken('session-1:user-1:org-1')).resolves.toBe(
      'replacement-token',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('invalidates all cached tokens when the session signs out', async () => {
    fetchMock
      .mockResolvedValueOnce({ token: 'signed-in-token' })
      .mockResolvedValueOnce({ token: 'next-session-token' });

    await getBetterAuthToken('session-1:user-1:org-1');
    await signOut();
    await expect(getBetterAuthToken('session-1:user-1:org-1')).resolves.toBe(
      'next-session-token',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares a failed exchange and coalesces the next retry wave', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce({ token: 'recovered-token' });

    const failedWave = await Promise.allSettled(
      Array.from({ length: 44 }, () =>
        getBetterAuthToken('session-1:user-1:org-1'),
      ),
    );

    expect(failedWave).toHaveLength(44);
    expect(failedWave.every((result) => result.status === 'rejected')).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(
      Promise.all(
        Array.from({ length: 44 }, () =>
          getBetterAuthToken('session-1:user-1:org-1'),
        ),
      ),
    ).resolves.toEqual(Array.from({ length: 44 }, () => 'recovered-token'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent forced refreshes', async () => {
    const refreshExchange = createDeferred<{ token: string }>();
    fetchMock
      .mockResolvedValueOnce({ token: 'cached-token' })
      .mockReturnValueOnce(refreshExchange.promise);

    await getBetterAuthToken('session-1:user-1:org-1');
    const firstRefresh = getBetterAuthToken('session-1:user-1:org-1', {
      forceRefresh: true,
    });
    const secondRefresh = getBetterAuthToken('session-1:user-1:org-1', {
      forceRefresh: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    refreshExchange.resolve({ token: 'fresh-token' });

    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
      'fresh-token',
      'fresh-token',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let one consumer cancellation abort the shared exchange', async () => {
    const deferred = createDeferred<{ token: string }>();
    const controller = new AbortController();
    fetchMock.mockReturnValue(deferred.promise);

    const cancelledConsumer = getBetterAuthToken('session-1:user-1:org-1', {
      signal: controller.signal,
    });
    const activeConsumer = getBetterAuthToken('session-1:user-1:org-1');

    controller.abort();

    await expect(cancelledConsumer).rejects.toMatchObject({
      name: 'AbortError',
    });

    deferred.resolve({ token: 'shared-token' });

    await expect(activeConsumer).resolves.toBe('shared-token');
    await expect(getBetterAuthToken('session-1:user-1:org-1')).resolves.toBe(
      'shared-token',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
