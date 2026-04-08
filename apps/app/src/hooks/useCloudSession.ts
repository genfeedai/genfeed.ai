'use client';

import { isCloudConnected, isHybridMode } from '@/lib/config/edition';

import { useOptionalAuth } from './useOptionalAuth';

/**
 * Provides runtime session state for cloud connectivity.
 *
 * Unlike the edition helpers which check env-var configuration,
 * this hook reflects whether the user actually has an active Clerk session.
 */
export function useCloudSession() {
  const auth = useOptionalAuth();

  return {
    /** True if the user has an active Clerk session */
    isConnected: auth.isSignedIn === true,
    /** True if Clerk is configured (hybrid or full cloud mode) */
    isCapable: isHybridMode() || isCloudConnected(),
    /** Current Clerk user ID, or null when not signed in */
    userId: auth.userId ?? null,
  };
}
