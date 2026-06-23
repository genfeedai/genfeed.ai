'use client';

import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';

/**
 * Returns provider-neutral auth helpers. Better Auth is the runtime provider;
 * the shared dispatcher keeps callers narrowed to a single `AuthIdentity` shape.
 */
export function useOptionalAuth() {
  return useAuthIdentity();
}
