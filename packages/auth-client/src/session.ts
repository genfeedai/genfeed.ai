'use client';

import { useCallback } from 'react';

import { authClient, getBetterAuthToken } from './client';

/**
 * Provider-neutral auth identity shape consumed by the app's token choke
 * points. Keeping the contract narrow keeps downstream call sites independent
 * from the concrete auth client.
 */
export interface AuthIdentity {
  getToken: (opts?: {
    forceRefresh?: boolean;
    template?: string;
  }) => Promise<string | null>;
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

/**
 * Adapts the Better Auth session to {@link AuthIdentity}. Better Auth is the
 * active provider, so downstream hooks never import provider-specific SDKs.
 *
 * `orgId` stays `null` until the organization plugin lands; the token cache
 * keys on `userId`, which is the value that matters here.
 */
export function useBetterAuthIdentity(): AuthIdentity {
  const { data, isPending } = authClient.useSession();

  const getToken = useCallback(() => getBetterAuthToken(), []);

  const session = data?.session as BetterAuthSessionShape | undefined;

  return {
    getToken,
    isLoaded: !isPending,
    isSignedIn: Boolean(data?.session),
    orgId: session?.activeOrganizationId ?? null,
    sessionId: session?.id ?? null,
    userId: data?.user?.id ?? null,
  };
}
