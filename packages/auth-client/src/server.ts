import {
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
} from '@genfeedai/contracts/constants';
import { BETTER_AUTH_BASE_PATH, getApiOrigin } from './config';

export { isBetterAuthEnabled, readBetterAuthEnabledFromEnv } from './config';

const HYPHENS_PATTERN = /-/g;
const UNDERSCORES_PATTERN = /_/g;

interface BetterAuthTokenResponse {
  token?: string;
}

/** Why one `/token` attempt produced no token. Carries no cookie or token. */
export interface BetterAuthServerTokenFailure {
  attempt: number;
  /** The system error code under a network failure, such as `ECONNRESET`. */
  code?: string;
  error?: string;
  /** No further attempt follows, so this failure is the exchange's outcome. */
  isFinal: boolean;
  reason: 'http' | 'missing-token' | 'network' | 'prerender-ended';
  status?: number;
}

type TokenAttemptFailure = Omit<BetterAuthServerTokenFailure, 'isFinal'>;

export interface BetterAuthServerTokenOptions {
  onFailure?: (failure: BetterAuthServerTokenFailure) => void;
  /** Overrides the `/token` URL for callers that reach the API by an internal address. */
  tokenUrl?: string;
}

const TOKEN_ATTEMPTS = 2;
/**
 * Pause before the retry. Both attempts of one production exchange failed 31ms
 * apart (APP-GENFEED-AI-1P, #9561), too soon for a reset connection or a
 * restarting API task to recover.
 */
const TOKEN_RETRY_DELAY_MS = 250;
const SYSTEM_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

/**
 * Digest Next.js puts on the rejection of a fetch still pending when the
 * prerender or prefetch that started it ends. It says nothing about the
 * session or the API, and asking again inside the same render rejects again.
 */
const NEXT_HANGING_PROMISE_REJECTION = 'HANGING_PROMISE_REJECTION';

function isPrerenderEndedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    error.digest === NEXT_HANGING_PROMISE_REJECTION
  );
}

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
      .replace(HYPHENS_PATTERN, '+')
      .replace(UNDERSCORES_PATTERN, '/')
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
function isRetryable(failure: TokenAttemptFailure): boolean {
  return (
    failure.reason === 'network' ||
    (failure.reason === 'http' && (failure.status ?? 0) >= 500)
  );
}

async function requestToken(
  cookieHeader: string,
  attempt: number,
  tokenUrl?: string,
): Promise<string | TokenAttemptFailure> {
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
    if (isPrerenderEndedError(error)) {
      return { attempt, reason: 'prerender-ended' };
    }
    const code = getSystemErrorCode(error);
    return {
      attempt,
      ...(code ? { code } : {}),
      error: error instanceof Error ? error.message : String(error),
      reason: 'network',
    };
  }
}

/**
 * Undici rejects every transport fault with the same `fetch failed` and keeps
 * the reason on `cause`. Only a code-shaped string is kept, never the cause's
 * message, which can carry the request URL.
 */
function getSystemErrorCode(error: unknown): string | undefined {
  const cause =
    error instanceof Error && typeof error.cause === 'object'
      ? error.cause
      : null;
  const code =
    cause !== null && 'code' in cause && typeof cause.code === 'string'
      ? cause.code
      : null;
  return code && SYSTEM_ERROR_CODE_PATTERN.test(code) ? code : undefined;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Server-side Bearer JWT retrieval for RSC bootstrap. Forwards the incoming
 * Better Auth session cookies to the `jwt` plugin's `/token` endpoint and
 * returns the minted JWT (the same token the API guard verifies via JWKS).
 *
 * Retries once, 250ms later, after a network error or 5xx. Returns `null` when
 * there is no session cookie or no attempt succeeded, so callers degrade
 * gracefully instead of throwing during render; `onFailure` reports each failed
 * attempt and marks the one that ends the exchange `isFinal`. A token is
 * reused for the same cookie header for up to 30 seconds (never past its own
 * expiry), and concurrent callers share one request. Failures are not cached.
 *
 * A caller that joined a shared request which then failed transiently asks once
 * for itself, through its own request even when another render has started a
 * replacement meanwhile. The request may have started inside a prerender or
 * prefetch that ended first, which kills its fetch for everyone waiting on it.
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
    // This caller already lost one shared request to a render that ended. The
    // replacement belongs to another render that can end too, so ask for
    // ourselves and leave that entry to its owner.
    return fetchServerToken(cookieHeader, options, { expiresAt: 0 });
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

    const isPrerenderEnded = result.reason === 'prerender-ended';
    const willRetry =
      !isPrerenderEnded && isRetryable(result) && attempt < TOKEN_ATTEMPTS;
    options.onFailure?.({ ...result, isFinal: !willRetry });
    if (isPrerenderEnded) {
      // Callers that joined from a live request still deserve a token.
      entry.hasTransientFailure = true;
      return null;
    }
    if (!isRetryable(result)) {
      return null;
    }
    if (willRetry) {
      await wait(TOKEN_RETRY_DELAY_MS);
    }
  }

  entry.hasTransientFailure = true;
  return null;
}
