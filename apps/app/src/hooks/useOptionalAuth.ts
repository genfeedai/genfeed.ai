'use client';

import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';

/**
 * Returns auth helpers from the active provider — Clerk by default, Better Auth
 * when the dual-run flag is on (epic #735). The shared dispatcher narrows both
 * to a single `AuthIdentity` shape so callers stay provider-agnostic.
 */
export function useOptionalAuth() {
  return useAuthIdentity();
}
