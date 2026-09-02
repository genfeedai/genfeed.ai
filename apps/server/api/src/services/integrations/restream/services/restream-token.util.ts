/**
 * Pure Restream access-token expiry helpers (no Nest DI).
 * Used by chat collect so unit tests can fake clocks without WebSockets.
 */

export interface RestreamCredentialTokens {
  accessToken: string | null;
  accessTokenExpiry?: Date | string | null;
  id?: string;
  refreshToken?: string | null;
}

export interface ResolvedRestreamAccess {
  accessToken: string;
  credentialId?: string;
  /** True when the caller must refresh before using the token. */
  needsRefresh: boolean;
  refreshToken?: string;
}

const DEFAULT_SKEW_MS = 60_000;

/**
 * True when access token is missing expiry, already expired, or expires within skew.
 */
export function isRestreamAccessTokenStale(
  accessTokenExpiry: Date | string | null | undefined,
  now: Date = new Date(),
  skewMs: number = DEFAULT_SKEW_MS,
): boolean {
  if (accessTokenExpiry == null || accessTokenExpiry === '') {
    // No expiry recorded — treat as usable until a collect fails.
    return false;
  }

  const expiry =
    accessTokenExpiry instanceof Date
      ? accessTokenExpiry
      : new Date(accessTokenExpiry);

  if (Number.isNaN(expiry.getTime())) {
    return true;
  }

  return expiry.getTime() <= now.getTime() + skewMs;
}

/**
 * Resolve whether the credential's access token can be used as-is or needs refresh.
 * Does not call the network.
 */
export function resolveRestreamAccessFromCredential(
  credential: RestreamCredentialTokens | null | undefined,
  now: Date = new Date(),
  skewMs: number = DEFAULT_SKEW_MS,
): ResolvedRestreamAccess | null {
  if (!credential) {
    return null;
  }

  const accessToken =
    typeof credential.accessToken === 'string'
      ? credential.accessToken.trim()
      : '';
  const refreshToken =
    typeof credential.refreshToken === 'string'
      ? credential.refreshToken.trim()
      : '';

  if (!accessToken && !refreshToken) {
    return null;
  }

  const stale = isRestreamAccessTokenStale(
    credential.accessTokenExpiry,
    now,
    skewMs,
  );

  if (!accessToken) {
    if (!refreshToken) {
      return null;
    }
    return {
      accessToken: '',
      credentialId: credential.id,
      needsRefresh: true,
      refreshToken,
    };
  }

  if (stale && refreshToken) {
    return {
      accessToken,
      credentialId: credential.id,
      needsRefresh: true,
      refreshToken,
    };
  }

  return {
    accessToken,
    credentialId: credential.id,
    needsRefresh: false,
    refreshToken: refreshToken || undefined,
  };
}

/**
 * Pick the access token to use after an optional refresh response.
 */
export function pickAccessTokenAfterRefresh(
  refreshed: { access_token?: string } | null | undefined,
  fallbackAccessToken: string,
): string | null {
  const next =
    typeof refreshed?.access_token === 'string'
      ? refreshed.access_token.trim()
      : '';
  if (next) {
    return next;
  }
  const fallback = fallbackAccessToken.trim();
  return fallback || null;
}
