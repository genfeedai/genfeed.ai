'use client';

import { authClient } from '@genfeedai/auth-client';
import type { IAuthPublicData } from '@genfeedai/interfaces';
import { getPlaywrightAuthState } from '@helpers/auth/auth.helper';
import { useMemo } from 'react';

export type AuthPublicMetadata = Partial<IAuthPublicData> & {
  proactiveLeadId?: string;
};

export interface AuthPrimaryEmailAddress {
  emailAddress: string | null;
}

export interface AuthUser {
  firstName: string | null;
  fullName: string | null;
  id: string;
  imageUrl: string | null;
  lastName: string | null;
  primaryEmailAddress: AuthPrimaryEmailAddress | null;
  publicMetadata: AuthPublicMetadata;
  reload: () => Promise<void>;
  updatedAt: Date | null;
}

interface BetterAuthUserShape {
  email?: string | null;
  id?: string;
  image?: string | null;
  name?: string | null;
  publicMetadata?: AuthPublicMetadata;
  updatedAt?: Date | string | null;
}

function splitName(name: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function toAuthUser(user: BetterAuthUserShape): AuthUser | null {
  if (!user.id) {
    return null;
  }

  const fullName = user.name ?? null;
  const { firstName, lastName } = splitName(fullName);

  return {
    firstName,
    fullName,
    id: user.id,
    imageUrl: user.image ?? null,
    lastName,
    primaryEmailAddress: { emailAddress: user.email ?? null },
    publicMetadata: user.publicMetadata ?? {},
    reload: async () => {
      await authClient.getSession();
    },
    updatedAt: normalizeDate(user.updatedAt),
  };
}

export function useAuthUser(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
} {
  const { data, isPending } = authClient.useSession();
  const playwrightAuth = getPlaywrightAuthState();

  return useMemo(() => {
    const user = toAuthUser((data?.user ?? {}) as BetterAuthUserShape);

    if (user) {
      return {
        isLoaded: !isPending,
        isSignedIn: true,
        user,
      };
    }

    if (playwrightAuth?.isSignedIn && playwrightAuth.userId) {
      return {
        isLoaded: true,
        isSignedIn: true,
        user: {
          firstName: null,
          fullName: null,
          id: playwrightAuth.userId,
          imageUrl: null,
          lastName: null,
          primaryEmailAddress: null,
          publicMetadata: playwrightAuth.publicMetadata ?? {},
          reload: async () => undefined,
          updatedAt: null,
        },
      };
    }

    return {
      isLoaded: !isPending,
      isSignedIn: false,
      user: null,
    };
  }, [data?.user, isPending, playwrightAuth]);
}
