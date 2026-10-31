import {
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
} from '@genfeedai/contracts/constants';
import { BETTER_AUTH_BASE_PATH, getApiOrigin } from './config';

export { isBetterAuthEnabled, readBetterAuthEnabledFromEnv } from './config';

interface BetterAuthTokenResponse {
  token?: string;
}

/** Why one `/token` attempt produced no token. Carries no cookie or token. */
export interface BetterAuthServerTokenFailure {
  attempt: number;
  error?: string;
  reason: 'http' | 'missing-token' | 'network';
  status?: number;
}

export interface BetterAuthServerTokenOptions {
  onFailure?: (failure: BetterAuthServerTokenFailure) => void;
  /** Overrides the `/token` URL for callers that reach the API by an internal address. */
  tokenUrl?: string;
}

const TOKEN_ATTEMPTS = 2;

// Every protected render, prefetch and server action asks for the same session's
// token, and the `/token` route is rate limited per client. Share one answer
// across them for as long as the browser-side cache does (client.ts).
const TOKEN_CACHE_TTL_MS = 30_000;
const TOKEN_EXPIRY_SKEW_MS = 5_000;
const TOKEN_CACHE_MAX_ENTRIES = 500;

interface ServerTokenCacheEntry {
  expiresAt: number;
  /** The shared request ended on a network error or 5xx, not a refused session. */
  hasTransientFailure?: boolean;
  promise?: Promise<string | null>;
  token?: string;
}

const serverTokenCache = new Map<string, ServerTokenCacheEntry>();

/** Drops every cached token. Tests only. */
export function resetBetterAuthServerTokenCache(): void {
  serverTokenCache.clear();
}

/**
 * Keys the cache by a digest of the cookie header so session cookies are never
 * held as map keys.
 */
async function getTokenCacheKey(cookieHeader: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(cookieHeader),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function getTokenExpiry(token: string): number {
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
    const parsed = JSON.parse(atob(normalizedPayload)) as { exp?: number };

    if (typeof parsed.exp !== 'number') {
      return fallbackExpiry;
    }

    return Math.min(fallbackExpiry, parsed.exp * 1000 - TOKEN_EXPIRY_SKEW_MS);
  } catch {
    return fallbackExpiry;
  }
}

function pruneServerTokenCache(): void {
  const now = Date.now();
  for (const [key, entry] of serverTokenCache) {
    if (!entry.promise && entry.expiresAt <= now) {
      serverTokenCache.delete(key);
    }
  }

  while (serverTokenCache.size >= TOKEN_CACHE_MAX_ENTRIES) {
    const oldestKey = serverTokenCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    serverTokenCache.delete(oldestKey);
  }
}

/**
 * Network errors and 5xx answers are transient; a 4xx means the session itself
 * is missing or refused, and asking again returns the same answer.
 */
function isRetryable(failure: BetterAuthServerTokenFailure): boolean {
  return (
    failure.reason === 'network' ||
    (failure.reason === 'http' && (failure.status ?? 0) >= 500)
  );
}

async function requestToken(
  cookieHeader: string,
  attempt: number,
  tokenUrl?: string,
): Promise<string | BetterAuthServerTokenFailure> {
  try {
    const response = await fetch(
      tokenUrl ?? `${getApiOrigin()}${BETTER_AUTH_BASE_PATH}/token`,
      {
        cache: 'no-store',
        headers: {
          cookie: cookieHeader,
          [UNATTRIBUTED_FORWARDED_HEADER]: UNATTRIBUTED_FORWARDED_VALUE,
        },
      },
    );

    if (!response.ok) {
      return { attempt, reason: 'http', status: response.status };
    }

    const data = (await response.json()) as BetterAuthTokenResponse;
    return data.token
      ? data.token
      : { attempt, reason: 'missing-token', status: response.status };
  } catch (error) {
    return {
      attempt,
      error: error instanceof Error ? error.message : String(error),
      reason: 'network',
    };
  }
}

/**
 * Server-side Bearer JWT retrieval for RSC bootstrap. Forwards the incoming
 * Better Auth session cookies to the `jwt` plugin's `/token` endpoint and
 * returns the minted JWT (the same token the API guard verifies via JWKS).
 *
 * Retries once after a network error or 5xx. Returns `null` when there is no
 * session cookie or no attempt succeeded, so callers degrade gracefully instead
 * of throwing during render; `onFailure` reports each failed attempt. A token is
 * reused for the same cookie header for up to 30 seconds (never past its own
 * expiry), and concurrent callers share one request. Failures are not cached.
 *
 * A caller that joined a shared request which then failed transiently asks once
 * for itself. The request may have started inside a prerender or prefetch that
 * ended first, which kills its fetch for everyone waiting on it.
 */
export async function getBetterAuthServerToken(
  cookieHeader: string,
  options: BetterAuthServerTokenOptions = {},
): Promise<string | null> {
  return requestSharedToken(cookieHeader, options, true);
}

async function requestSharedToken(
  cookieHeader: string,
  options: BetterAuthServerTokenOptions,
  canJoinInFlight: boolean,
): Promise<string | null> {
  if (!cookieHeader) {
    return null;
  }

  const cacheKey = await getTokenCacheKey(cookieHeader);
  const cached = serverTokenCache.get(cacheKey);
  if (cached?.promise && canJoinInFlight) {
    const sharedToken = await cached.promise;
    return sharedToken === null && cached.hasTransientFailure
      ? requestSharedToken(cookieHeader, options, false)
      : sharedToken;
  }
  if (cached?.promise) {
    return cached.promise;
  }
  if (cached?.token && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  pruneServerTokenCache();
  const entry: ServerTokenCacheEntry = { expiresAt: 0 };
  entry.promise = fetchServerToken(cookieHeader, options, entry).then(
    (token) => {
      delete entry.promise;
      if (token && serverTokenCache.get(cacheKey) === entry) {
        entry.token = token;
        entry.expiresAt = getTokenExpiry(token);
      } else {
        serverTokenCache.delete(cacheKey);
      }
      return token;
    },
  );
  serverTokenCache.set(cacheKey, entry);

  return entry.promise;
}

async function fetchServerToken(
  cookieHeader: string,
  options: BetterAuthServerTokenOptions,
  entry: ServerTokenCacheEntry,
): Promise<string | null> {
  for (let attempt = 1; attempt <= TOKEN_ATTEMPTS; attempt += 1) {
    const result = await requestToken(cookieHeader, attempt, options.tokenUrl);
    if (typeof result === 'string') {
      return result;
    }

    options.onFailure?.(result);
    if (!isRetryable(result)) {
      return null;
    }
  }

  entry.hasTransientFailure = true;
  return null;
}
