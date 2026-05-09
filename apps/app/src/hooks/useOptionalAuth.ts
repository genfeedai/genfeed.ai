'use client';

import { useAuth } from '@clerk/nextjs';

/** Returns auth helpers from the app-level Clerk provider. */
export function useOptionalAuth() {
  return useAuth();
}
