'use client';

import { useAuth } from '@clerk/nextjs';
import {
  type AuthIdentity,
  isBetterAuthEnabled,
  useBetterAuthIdentity,
} from '@genfeedai/auth-client';

export type { AuthIdentity };

/**
 * Clerk's `useAuth()` narrowed to the {@link AuthIdentity} contract. Only
 * invoked when Clerk is the active provider.
 */
function useClerkIdentity(): AuthIdentity {
  const { getToken, isLoaded, isSignedIn, orgId, userId } = useAuth();

  return {
    getToken: getToken as AuthIdentity['getToken'],
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    orgId: orgId ?? null,
    userId: userId ?? null,
  };
}

/**
 * The single frontend auth-identity choke point for the Clerk -> Better Auth
 * dual run (epic #735). Bound once at module load (never per-render) so the
 * React hook order is stable, Clerk's `useAuth()` is never called under Better
 * Auth, and Better Auth's session is never fetched while Clerk is the default.
 *
 * Every authenticated frontend surface — the two token caches
 * (`useAuthedService` / `useContextAuthedService`), the route gate
 * (`ProtectedAuthGate`) and `useOptionalAuth` — resolves identity through here,
 * so the cutover is a single flag flip. When Clerk is removed (Phase 4) this
 * collapses to `useBetterAuthIdentity`.
 */
export const useAuthIdentity: () => AuthIdentity = isBetterAuthEnabled()
  ? useBetterAuthIdentity
  : useClerkIdentity;
