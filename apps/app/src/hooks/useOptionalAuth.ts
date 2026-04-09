'use client';

import { useAuth } from '@clerk/nextjs';

/**
 * Returns auth helpers from Clerk, falling back to safe defaults when the
 * component renders outside an authenticated context (e.g. public pages).
 */
export function useOptionalAuth() {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: this wrapper intentionally catches missing Clerk provider usage on public pages
    return useAuth();
  } catch {
    return {
      getToken: async () => null,
      isLoaded: true,
      isSignedIn: false,
      orgId: null,
      orgRole: null,
      orgSlug: null,
      sessionId: null,
      signOut: async () => undefined,
      userId: null,
    } as ReturnType<typeof useAuth>;
  }
}
