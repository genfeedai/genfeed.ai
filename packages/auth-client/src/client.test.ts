import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('better-auth/client/plugins', () => ({
  adminClient: vi.fn(() => 'admin-plugin'),
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
  authClient,
  clearBetterAuthTokenCache,
  getBetterAuthToken,
  getBetterAuthTokenContextKey,
  signOut,
} from './client';
import { subscribeSignedOut } from './signed-out-sync';

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

  it('starts a new exchange for a forced refresh during an in-flight one', async () => {
    const oldExchange = createDeferred<{ token: string }>();
    const newExchange = createDeferred<{ token: string }>();
    fetchMock
      .mockReturnValueOnce(oldExchange.promise)
      .mockReturnValueOnce(newExchange.promise);

    const plain = getBetterAuthToken('session-1:user-1:org-1');
    const forced = getBetterAuthToken('session-1:user-1:org-1', {
      forceRefresh: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    oldExchange.resolve({ token: 'old' });
    await expect(plain).resolves.toBe('old');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    newExchange.resolve({ token: 'new' });
    await expect(forced).resolves.toBe('new');
    await expect(getBetterAuthToken('session-1:user-1:org-1')).resolves.toBe(
      'new',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one new exchange between forced refreshes during an in-flight one', async () => {
    const oldExchange = createDeferred<{ token: string }>();
    const newExchange = createDeferred<{ token: string }>();
    fetchMock
      .mockReturnValueOnce(oldExchange.promise)
      .mockReturnValueOnce(newExchange.promise);

    void getBetterAuthToken('session-1:user-1:org-1');
    const first = getBetterAuthToken('session-1:user-1:org-1', {
      forceRefresh: true,
    });
    const second = getBetterAuthToken('session-1:user-1:org-1', {
      forceRefresh: true,
    });

    oldExchange.resolve({ token: 'old' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    newExchange.resolve({ token: 'new' });

    await expect(Promise.all([first, second])).resolves.toEqual(['new', 'new']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not reject a forced refresh when the in-flight exchange fails', async () => {
    const oldExchange = createDeferred<{ token: string }>();
    fetchMock
      .mockReturnValueOnce(
        oldExchange.promise.then(() => {
          throw new Error('rate limited');
        }),
      )
      .mockResolvedValueOnce({ token: 'new' });

    const plain = getBetterAuthToken('session-1:user-1:org-1');
    const forced = getBetterAuthToken('session-1:user-1:org-1', {
      forceRefresh: true,
    });

    oldExchange.resolve({ token: 'unused' });
    await expect(plain).rejects.toThrow('rate limited');
    await expect(forced).resolves.toBe('new');
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

describe('signOut across tabs', () => {
  let signedOutMessages = 0;
  let unsubscribe: () => void = () => {};

  beforeEach(() => {
    signedOutMessages = 0;
    unsubscribe = subscribeSignedOut(() => {
      signedOutMessages += 1;
    });
  });

  afterEach(() => {
    unsubscribe();
  });

  async function settleBroadcast(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }

  it('tells the other tabs once the server ended the session', async () => {
    vi.mocked(authClient.signOut).mockResolvedValueOnce({
      data: { success: true },
      error: null,
    });

    await signOut();

    await vi.waitFor(() => expect(signedOutMessages).toBe(1));
    await settleBroadcast();
    expect(signedOutMessages).toBe(1);
  });

  it('keeps the other tabs signed in when the server refused the sign-out', async () => {
    vi.mocked(authClient.signOut).mockResolvedValueOnce({
      data: null,
      error: { message: 'unavailable', status: 503, statusText: 'Unavailable' },
    });

    await signOut();
    await settleBroadcast();

    expect(signedOutMessages).toBe(0);
  });

  it('keeps the other tabs signed in when the request throws', async () => {
    vi.mocked(authClient.signOut).mockRejectedValueOnce(new Error('offline'));

    await expect(signOut()).rejects.toThrow('offline');
    await settleBroadcast();

    expect(signedOutMessages).toBe(0);
  });
});
