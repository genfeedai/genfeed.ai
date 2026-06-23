'use client';

import {
  type AuthIdentity,
  useBetterAuthIdentity,
} from '@genfeedai/auth-client';

export type { AuthIdentity };

/**
 * The single frontend auth-identity choke point. Better Auth is the only active
 * web session provider; local desktop/offline bypasses happen above this hook.
 */
export const useAuthIdentity: () => AuthIdentity = useBetterAuthIdentity;
