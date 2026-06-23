'use client';

import type { PropsWithChildren, ReactNode } from 'react';

import { authClient, signOut } from './client';
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

export function useUser() {
  const { data, isPending } = authClient.useSession();

  return {
    isLoaded: !isPending,
    isSignedIn: Boolean(data?.session),
    user: data?.user ?? null,
  };
}

export function useOrganization() {
  return {
    isLoaded: true,
    organization: null,
  };
}

export function useOrganizationList() {
  return {
    isLoaded: true,
    organizationList: [],
    setActive: async () => undefined,
  };
}

function AuthFormPlaceholder({
  children,
}: {
  children?: ReactNode;
  [key: string]: unknown;
}) {
  return <>{children ?? null}</>;
}

export const SignIn = AuthFormPlaceholder;
export const SignUp = AuthFormPlaceholder;
export const SignInButton = AuthFormPlaceholder;
