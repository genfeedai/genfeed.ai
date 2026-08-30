import { BETTER_AUTH_BASE_PATH, getApiOrigin } from './config';

export { isBetterAuthEnabled } from './config';

interface BetterAuthTokenResponse {
  token?: string;
}

/**
 * Server-side Bearer JWT retrieval for RSC bootstrap. Forwards the incoming
 * Better Auth session cookies to the `jwt` plugin's `/token` endpoint and
 * returns the minted JWT (the same token the API guard verifies via JWKS).
 *
 * Returns `null` when there is no session cookie or on any failure, so callers
 * degrade gracefully to client-side fetching instead of throwing during render.
 */
export async function getBetterAuthServerToken(
  cookieHeader: string,
): Promise<string | null> {
  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(
      `${getApiOrigin()}${BETTER_AUTH_BASE_PATH}/token`,
      {
        cache: 'no-store',
        headers: { cookie: cookieHeader },
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as BetterAuthTokenResponse;
    return data.token ?? null;
  } catch {
    return null;
  }
}
