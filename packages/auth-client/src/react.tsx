'use client';

import type { PropsWithChildren } from 'react';

import { signOut } from './client';
import { useBetterAuthIdentity } from './session';

export interface BetterAuthProviderProps extends PropsWithChildren {
  appearance?: {
    theme?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function BetterAuthProvider({ children }: BetterAuthProviderProps) {
  return <>{children}</>;
}

export function useAuth() {
  const identity = useBetterAuthIdentity();

  return {
    ...identity,
    getToken: identity.getToken,
    signOut,
  };
}

export function useAuthClient() {
  return { signOut };
}
