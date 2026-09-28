'use client';

import { useCallback, useEffect, useRef } from 'react';

import {
  authClient,
  type BetterAuthTokenContext,
  type BetterAuthTokenRequestOptions,
  clearBetterAuthTokenCache,
  getBetterAuthToken,
  getBetterAuthTokenContextKey,
  getSession,
} from './client';

/**
 * Provider-neutral auth identity shape consumed by the app's token choke
 * points. Keeping the contract narrow keeps downstream call sites independent
 * from the concrete auth client.
 */
export interface AuthIdentity {
  getToken: (opts?: BetterAuthTokenRequestOptions) => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  orgId: string | null;
  sessionId: string | null;
  userId: string | null;
}

interface BetterAuthSessionShape {
  activeOrganizationId?: string | null;
  id?: string | null;
}

interface BetterAuthSessionData {
  session?: unknown;
  user?: { id?: string | null } | null;
}

/** The token cache context for a session, shared by the hook and non-hook paths. */
function toTokenContext(
  data: BetterAuthSessionData | null | undefined,
): BetterAuthTokenContext {
  const session = data?.session as BetterAuthSessionShape | undefined;

  return {
    organizationId: session?.activeOrganizationId ?? null,
    sessionId: session?.id ?? null,
    userId: data?.user?.id ?? null,
  };
}

export class BetterAuthSessionLookupError extends Error {
  constructor(message?: string) {
    super(message || 'Session lookup failed');
    this.name = 'BetterAuthSessionLookupError';
  }
}

export class BetterAuthTokenUnavailableError extends Error {
  constructor() {
    super('Authentication token unavailable');
    this.name = 'BetterAuthTokenUnavailableError';
  }
}

/**
 * The signed-in visitor's API token, outside React.
 *
 * For a page that only needs the session when the visitor acts (submits a
 * form), so it can import this module then instead of mounting
 * `useBetterAuthIdentity` and shipping the auth client with the page. Keys the
 * token cache exactly as the hook does. Resolves `null` when nobody is signed
 * in. Rejects with {@link BetterAuthSessionLookupError} when the session
 * lookup fails, and with {@link BetterAuthTokenUnavailableError} when a
 * session exists but no token could be minted.
 */
export async function getSignedInBetterAuthToken(
  options?: BetterAuthTokenRequestOptions,
): Promise<string | null> {
  const result = await getSession();

  // A failed lookup is not a signed-out visitor: callers would otherwise
  // send a signed-in user down the anonymous path.
  if (result?.error) {
    throw new BetterAuthSessionLookupError(result.error.message);
  }

  if (!result?.data?.session) {
    return null;
  }

  const token = await getBetterAuthToken(
    getBetterAuthTokenContextKey(toTokenContext(result.data)),
    options,
  );

  if (!token) {
    throw new BetterAuthTokenUnavailableError();
  }

  return token;
}

/**
 * Adapts the Better Auth session to {@link AuthIdentity}. Better Auth is the
 * active provider, so downstream hooks never import provider-specific SDKs.
 *
 * `orgId` stays `null` until the organization plugin lands; the token cache
 * keys on `userId`, which is the value that matters here.
 */
export function useBetterAuthIdentity(): AuthIdentity {
  const { data, isPending } = authClient.useSession();
  const { organizationId, sessionId, userId } = toTokenContext(data);
  const tokenContextKey = getBetterAuthTokenContextKey({
    organizationId,
    sessionId,
    userId,
  });
  const previousTokenContextKeyRef = useRef(tokenContextKey);

  useEffect(() => {
    const previousTokenContextKey = previousTokenContextKeyRef.current;
    previousTokenContextKeyRef.current = tokenContextKey;

    if (previousTokenContextKey !== tokenContextKey) {
      clearBetterAuthTokenCache(previousTokenContextKey);
    }
  }, [tokenContextKey]);

  const getToken = useCallback(
    (options?: BetterAuthTokenRequestOptions) =>
      getBetterAuthToken(tokenContextKey, options),
    [tokenContextKey],
  );

  return {
    getToken,
    isLoaded: !isPending,
    isSignedIn: Boolean(data?.session),
    orgId: organizationId,
    sessionId,
    userId,
  };
}
