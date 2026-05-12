'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import type { IUser } from '@genfeedai/interfaces';
import { User } from '@genfeedai/models/auth/user.model';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { AuthService } from '@genfeedai/services/auth/auth.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { getPlaywrightAuthState } from '@helpers/auth/clerk.helper';
<<<<<<< HEAD
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo } from 'react';
=======
import { createContext, useCallback, useContext } from 'react';
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
import { loadClientProtectedBootstrap } from '../../providers/protected-bootstrap/client-protected-bootstrap';
import { useContextAuthedService } from '../internal/context-authed-service';

export interface UserContextValue {
  currentUser: IUser | null;
  isFirstLogin: boolean;
  setIsFirstLogin: (value: boolean) => void;
  isLoading: boolean;
  refetchUser: () => Promise<void>;
  mutateUser: (user: IUser) => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);
const USER_CONTEXT_CACHE_TTL_MS = 60_000;

interface UserProviderProps extends LayoutProps {
  initialCurrentUser?: IUser | null;
}

export function UserProvider({
  children,
  initialCurrentUser = null,
}: UserProviderProps) {
  const { isLoaded: isAuthLoaded, isSignedIn, orgId } = useAuth();
  const { user } = useUser();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const clerkUserId = user?.id ?? playwrightAuth?.userId ?? null;
  const clerkUserUpdatedAt = user?.updatedAt?.getTime() ?? null;

  const getUsersService = useContextAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const getAuthService = useContextAuthedService((token: string) =>
    AuthService.getInstance(token),
  );

  const queryClient = useQueryClient();
  const shouldFetch =
    effectiveIsAuthLoaded && effectiveIsSignedIn && !!clerkUserId;
  const effectiveOrgId = orgId ?? playwrightAuth?.orgId ?? null;
  const clientBootstrapCacheKey = shouldFetch
    ? `protected-bootstrap:${clerkUserId}:${effectiveOrgId ?? 'no-org'}`
    : undefined;
<<<<<<< HEAD

  const initialUser = useMemo(
    () => (initialCurrentUser ? new User(initialCurrentUser) : null),
    [initialCurrentUser],
  );

  const queryKey = useMemo(
    () => ['user-context', clerkUserId, clerkUserUpdatedAt, effectiveOrgId],
    [clerkUserId, clerkUserUpdatedAt, effectiveOrgId],
  );
=======
  const userCacheKey = clerkUserId
    ? `user-context:current-user:${clerkUserId}`
    : undefined;
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)

  const {
    data: currentUser = null,
    isLoading,
    refetch,
  } = useQuery({
    enabled: shouldFetch,
    initialData: initialUser ?? undefined,
    initialDataUpdatedAt: initialCurrentUser != null ? 0 : undefined,
    queryFn: async () => {
      if (!effectiveIsSignedIn || !clerkUserId) {
        return null;
      }

      try {
        const bootstrap = await loadClientProtectedBootstrap(
          clientBootstrapCacheKey,
          getAuthService,
        );

        if (bootstrap?.currentUser) {
          return new User(bootstrap.currentUser);
        }
      } catch (error) {
        logger.warn('Failed to load client protected bootstrap for user', {
          error,
          reportToSentry: false,
        });
      }

      const service = await getUsersService();
      const userData = await service.findMe();

      if (userData) {
        return new User(userData);
      }

      return null;
    },
<<<<<<< HEAD
    queryKey,
    staleTime: USER_CONTEXT_CACHE_TTL_MS,
  });
=======
    {
      cacheKey: userCacheKey,
      cacheTimeMs: USER_CONTEXT_CACHE_TTL_MS,
      dependencies: [clerkUserId, clerkUserUpdatedAt, effectiveOrgId],
      enabled: shouldFetch,
      initialData: initialCurrentUser ? new User(initialCurrentUser) : null,
      revalidateOnMount: initialCurrentUser == null,
    },
  );
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)

  const isFirstLogin = currentUser?.settings?.isFirstLogin ?? false;

  const mutate = useCallback(
    (nextUser: User | null) => {
      queryClient.setQueryData(queryKey, nextUser);
    },
    [queryClient, queryKey],
  );

  const patchMe = useCallback(
    async (value: boolean) => {
      if (!currentUser) {
        return;
      }

      try {
        const service = await getUsersService();

        await service.patchSettings(currentUser.id, { isFirstLogin: value });
        mutate(
          new User({
            ...currentUser,
            settings: { ...currentUser.settings, isFirstLogin: value },
          }),
        );
      } catch (error) {
        logger.error('Failed to update isFirstLogin status', error);
      }
    },
    [currentUser, mutate, getUsersService],
  );

  const refetchUser = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const mutateUser = useCallback(
    (user: IUser) => {
      mutate(new User(user));
    },
    [mutate],
  );

  return (
    <UserContext.Provider
      value={{
        currentUser,
        isFirstLogin,
        isLoading,
        mutateUser,
        refetchUser,
        setIsFirstLogin: patchMe,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useCurrentUser(): UserContextValue {
  const context = useContext(UserContext);

  if (context === undefined) {
    throw new Error(
      'useCurrentUser must be used within a UserProvider. The component calling this hook is not wrapped by UserProvider.',
    );
  }

  return context;
}

export function useOptionalUser(): UserContextValue | undefined {
  return useContext(UserContext);
}
