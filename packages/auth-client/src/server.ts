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
}

const TOKEN_ATTEMPTS = 2;

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
): Promise<string | BetterAuthServerTokenFailure> {
  try {
    const response = await fetch(
      `${getApiOrigin()}${BETTER_AUTH_BASE_PATH}/token`,
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
 * of throwing during render; `onFailure` reports each failed attempt.
 */
export async function getBetterAuthServerToken(
  cookieHeader: string,
  options: BetterAuthServerTokenOptions = {},
): Promise<string | null> {
  if (!cookieHeader) {
    return null;
  }

  for (let attempt = 1; attempt <= TOKEN_ATTEMPTS; attempt += 1) {
    const result = await requestToken(cookieHeader, attempt);
    if (typeof result === 'string') {
      return result;
    }

    options.onFailure?.(result);
    if (!isRetryable(result)) {
      return null;
    }
  }

  return null;
}
