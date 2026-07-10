'use client';

import { isBetterAuthEnabled } from '@genfeedai/auth-client';
import { isCloudDeployment } from '@genfeedai/config/deployment';

import { useOptionalAuth } from './useOptionalAuth';

/**
 * Provides runtime session state for cloud connectivity.
 *
 * Unlike the edition helpers which check env-var configuration,
 * this hook reflects whether the user actually has an active auth session.
 */
export function useCloudSession() {
  const auth = useOptionalAuth();

  return {
    /** True if the user has an active cloud session (signed in with a real user ID).
     * In desktop offline mode isSignedIn is true to bypass guards, but userId is null — not cloud-connected. */
    isConnected: auth.isSignedIn === true && auth.userId !== null,
    /** True if cloud auth is configured (hybrid or full cloud mode) */
    isCapable: isCloudDeployment() || isBetterAuthEnabled(),
    /** Current auth user ID, or null when not signed in */
    userId: auth.userId ?? null,
  };
}
