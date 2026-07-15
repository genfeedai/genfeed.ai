'use client';

import { jwtClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { BETTER_AUTH_BASE_PATH, getApiOrigin } from './config';

/**
 * Singleton Better Auth browser client (epic #735). Mounted against the Phase 1
 * handler at `${origin}/v1/auth/*`.
 *
 * - `baseURL` is the bare origin and `basePath` carries the full `/v1/auth`
 *   prefix — see {@link BETTER_AUTH_BASE_PATH} for why the prefix cannot live in
 *   `baseURL`.
 * - `magicLinkClient` powers passwordless `signIn.magicLink()` — it routes via
 *   the dynamic client proxy, so it requires the server `magicLink` plugin
 *   (Phase 1) to be enabled or the call 404s with no compile-time error.
 * - `jwtClient` adds the `jwks` action; the Bearer JWT itself is read from the
 *   server's `GET /token` endpoint (see {@link getBetterAuthToken}).
 *
 * Better Auth's React client is provider-less (nanostores-backed), so no
 * `<Provider>` is required for `useSession()` to work anywhere in the tree.
 */
export const authClient = createAuthClient({
  basePath: BETTER_AUTH_BASE_PATH,
  baseURL: getApiOrigin(),
  plugins: [magicLinkClient(), jwtClient()],
});

export const {
  getSession,
  requestPasswordReset,
  resetPassword,
  signIn,
  signUp,
  useSession,
} = authClient;

const TOKEN_CACHE_TTL_MS = 30_000;
const TOKEN_EXPIRY_SKEW_MS = 5_000;
const DEFAULT_TOKEN_CONTEXT_KEY = '__default__';
const DEFAULT_TOKEN_TEMPLATE_KEY = '__default__';
const TOKEN_CACHE_KEY_SEPARATOR = '\u0001';

export interface BetterAuthTokenContext {
  organizationId: string | null;
  sessionId: string | null;
  userId: string | null;
}

export interface BetterAuthTokenRequestOptions {
  forceRefresh?: boolean;
  signal?: AbortSignal;
  template?: string;
}

const DEFAULT_TOKEN_REQUEST_OPTIONS: BetterAuthTokenRequestOptions = {};

interface BetterAuthTokenCacheEntry {
  expiresAt: number;
  promise?: Promise<string | null>;
  token?: string;
}

const betterAuthTokenCache = new Map<string, BetterAuthTokenCacheEntry>();

export function getBetterAuthTokenContextKey(
  context: BetterAuthTokenContext,
): string {
  return [
    context.sessionId ?? 'no-session',
    context.userId ?? 'anonymous',
    context.organizationId ?? 'no-org',
  ].join(TOKEN_CACHE_KEY_SEPARATOR);
}

function getBetterAuthTokenCacheKey(
  contextKey: string,
  template?: string,
): string {
  return [contextKey, template ?? DEFAULT_TOKEN_TEMPLATE_KEY].join(
    TOKEN_CACHE_KEY_SEPARATOR,
  );
}

function getJwtAwareExpiry(token: string): number {
  const fallbackExpiry = Date.now() + TOKEN_CACHE_TTL_MS;
  const payload = token.split('.')[1];

  if (!payload) {
    return fallbackExpiry;
  }

  try {
    const normalizedPayload = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decodedPayload = atob(normalizedPayload);
    const parsed = JSON.parse(decodedPayload) as { exp?: number };

    if (typeof parsed.exp !== 'number') {
      return fallbackExpiry;
    }

    return Math.min(
      fallbackExpiry,
      Math.max(Date.now(), parsed.exp * 1000 - TOKEN_EXPIRY_SKEW_MS),
    );
  } catch {
    return fallbackExpiry;
  }
}

function waitForTokenConsumer(
  promise: Promise<string | null>,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!signal) {
    return promise;
  }

  return new Promise<string | null>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Token request aborted', 'AbortError'));
      return;
    }

    const handleAbort = (): void => {
      reject(new DOMException('Token request aborted', 'AbortError'));
    };
    const cleanup = (): void => {
      signal.removeEventListener('abort', handleAbort);
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    promise.then(
      (token) => {
        cleanup();
        resolve(token);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function extractBetterAuthToken(response: unknown): string | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const directToken = (response as { token?: unknown }).token;
  if (typeof directToken === 'string' && directToken.length > 0) {
    return directToken;
  }

  const data = (response as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return null;
  }

  const nestedToken = (data as { token?: unknown }).token;
  return typeof nestedToken === 'string' && nestedToken.length > 0
    ? nestedToken
    : null;
}

function getInFlightTokenPromise(
  cacheEntry: BetterAuthTokenCacheEntry | undefined,
): Promise<string | null> | null {
  if (!cacheEntry) {
    return null;
  }

  return cacheEntry.promise ?? null;
}

function getUnexpiredToken(
  cacheEntry: BetterAuthTokenCacheEntry | undefined,
): string | null {
  if (!cacheEntry) {
    return null;
  }
  if (!cacheEntry.token) {
    return null;
  }
  if (cacheEntry.expiresAt <= Date.now()) {
    return null;
  }

  return cacheEntry.token;
}

function getReusableTokenPromise(
  cacheKey: string,
  isForceRefresh: boolean,
): Promise<string | null> | null {
  const cacheEntry = betterAuthTokenCache.get(cacheKey);
  const inFlightPromise = getInFlightTokenPromise(cacheEntry);

  if (inFlightPromise) {
    return inFlightPromise;
  }
  if (isForceRefresh) {
    return null;
  }

  const token = getUnexpiredToken(cacheEntry);
  return token ? Promise.resolve(token) : null;
}

function cacheResolvedToken(
  cacheKey: string,
  cacheEntry: BetterAuthTokenCacheEntry,
  token: string | null,
): string | null {
  if (betterAuthTokenCache.get(cacheKey) !== cacheEntry) {
    return null;
  }

  if (!token) {
    betterAuthTokenCache.delete(cacheKey);
    return null;
  }

  cacheEntry.expiresAt = getJwtAwareExpiry(token);
  cacheEntry.token = token;
  return token;
}

function deleteTokenCacheEntry(
  cacheKey: string,
  cacheEntry: BetterAuthTokenCacheEntry,
): void {
  if (betterAuthTokenCache.get(cacheKey) === cacheEntry) {
    betterAuthTokenCache.delete(cacheKey);
  }
}

function clearInFlightTokenPromise(
  cacheKey: string,
  cacheEntry: BetterAuthTokenCacheEntry,
): void {
  if (betterAuthTokenCache.get(cacheKey) === cacheEntry) {
    cacheEntry.promise = undefined;
  }
}

function createBetterAuthTokenExchange(
  cacheKey: string,
): Promise<string | null> {
  const cacheEntry: BetterAuthTokenCacheEntry = { expiresAt: 0 };
  const exchange = authClient
    .$fetch<{ token: string }>('/token', { method: 'GET' })
    .then(extractBetterAuthToken)
    .then((token) => cacheResolvedToken(cacheKey, cacheEntry, token))
    .catch((error: unknown) => {
      deleteTokenCacheEntry(cacheKey, cacheEntry);
      throw error;
    })
    .finally(() => {
      clearInFlightTokenPromise(cacheKey, cacheEntry);
    });

  cacheEntry.promise = exchange;
  betterAuthTokenCache.set(cacheKey, cacheEntry);
  return exchange;
}

/**
 * Retrieves a Bearer JWT minted by the Better Auth `jwt` plugin via its server
 * `GET /token` endpoint (the jwt *client* plugin only exposes `jwks`, not a
 * `token()` action in 1.6.x — so we call `$fetch` directly). Non-hook, so it is
 * safe to call from the token choke point in `@genfeedai/helpers` and other
 * non-React contexts. Concurrent callers share one session-scoped exchange and
 * valid results are cached for at most 30 seconds. A consumer abort only stops
 * that consumer's wait; it never aborts the shared exchange. Returns `null`
 * when there is no active session or the context was invalidated in flight.
 */
export function getBetterAuthToken(
  contextKey = DEFAULT_TOKEN_CONTEXT_KEY,
  options = DEFAULT_TOKEN_REQUEST_OPTIONS,
): Promise<string | null> {
  const cacheKey = getBetterAuthTokenCacheKey(contextKey, options.template);
  const tokenPromise =
    getReusableTokenPromise(cacheKey, options.forceRefresh === true) ??
    createBetterAuthTokenExchange(cacheKey);

  return waitForTokenConsumer(tokenPromise, options.signal);
}

export function clearBetterAuthTokenCache(contextKey?: string): void {
  if (!contextKey) {
    betterAuthTokenCache.clear();
    return;
  }

  const cacheKeyPrefix = `${contextKey}${TOKEN_CACHE_KEY_SEPARATOR}`;
  for (const cacheKey of betterAuthTokenCache.keys()) {
    if (cacheKey.startsWith(cacheKeyPrefix)) {
      betterAuthTokenCache.delete(cacheKey);
    }
  }
}

export async function signOut(
  ...args: Parameters<typeof authClient.signOut>
): Promise<Awaited<ReturnType<typeof authClient.signOut>>> {
  try {
    return await authClient.signOut(...args);
  } finally {
    clearBetterAuthTokenCache();
  }
}
