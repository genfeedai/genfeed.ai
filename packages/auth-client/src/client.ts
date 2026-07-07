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
  signOut,
  signUp,
  useSession,
} = authClient;

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

/**
 * Retrieves a Bearer JWT minted by the Better Auth `jwt` plugin via its server
 * `GET /token` endpoint (the jwt *client* plugin only exposes `jwks`, not a
 * `token()` action in 1.6.x — so we call `$fetch` directly). Non-hook, so it is
 * safe to call from the token choke point in `@genfeedai/helpers` and other
 * non-React contexts. Returns `null` when there is no active session.
 */
export async function getBetterAuthToken(): Promise<string | null> {
  const response = await authClient.$fetch<{ token: string }>('/token', {
    method: 'GET',
  });
  return extractBetterAuthToken(response);
}
