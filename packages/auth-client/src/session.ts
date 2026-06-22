'use client';

import { useCallback } from 'react';

import { authClient, getBetterAuthToken } from './client';

/**
 * The subset of Clerk's `useAuth()` shape that the app's token choke points
 * consume. Keeping the contract narrow is what lets a single module-load swap
 * replace Clerk without touching the ~30 downstream call sites.
 */
export interface AuthIdentity {
  getToken: (opts?: {
    forceRefresh?: boolean;
    template?: string;
  }) => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  orgId: string | null;
  userId: string | null;
}

interface BetterAuthSessionShape {
  activeOrganizationId?: string | null;
}

/**
 * Adapts the Better Auth session to {@link AuthIdentity}. Selected at module
 * load (never per-render) in place of Clerk's `useAuth()` when the dual-run flag
 * is on, so there are no conditional hook calls and Clerk is never contacted
 * while Better Auth is the active provider.
 *
 * `orgId` stays `null` until the organization plugin lands (Phase 3+); the
 * choke-point cache keys on `userId`, which is the value that matters here.
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
    userId: data?.user?.id ?? null,
  };
}
