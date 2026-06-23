'use client';

import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@genfeedai/hooks/auth/use-auth-user/use-auth-user';
import type { IUser } from '@genfeedai/interfaces';
import { User } from '@genfeedai/models/auth/user.model';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { AuthService } from '@genfeedai/services/auth/auth.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { getPlaywrightAuthState } from '@helpers/auth/auth.helper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useMemo } from 'react';
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
  hasInitialBootstrap?: boolean;
  initialCurrentUser?: IUser | null;
}

export function UserProvider({
  children,
  hasInitialBootstrap = false,
  initialCurrentUser = null,
}: UserProviderProps) {
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    orgId,
    userId,
  } = useAuthIdentity();
  const { user } = useAuthUser();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const authUserId = userId ?? user?.id ?? playwrightAuth?.userId ?? null;
  const authUserUpdatedAt = user?.updatedAt?.getTime() ?? null;

  const getUsersService = useContextAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const getAuthService = useContextAuthedService((token: string) =>
    AuthService.getInstance(token),
  );

  const queryClient = useQueryClient();
  const shouldFetch =
    effectiveIsAuthLoaded && effectiveIsSignedIn && !!authUserId;
  const effectiveOrgId = orgId ?? playwrightAuth?.orgId ?? null;
  const clientBootstrapCacheKey = shouldFetch
    ? `protected-bootstrap:${authUserId}:${effectiveOrgId ?? 'no-org'}`
    : undefined;

  const initialUser = useMemo(
    () => (initialCurrentUser ? new User(initialCurrentUser) : null),
    [initialCurrentUser],
  );
  const initialDataUpdatedAt = useMemo(() => Date.now(), []);

  const queryKey = useMemo(
    () => ['user-context', authUserId, authUserUpdatedAt, effectiveOrgId],
    [authUserId, authUserUpdatedAt, effectiveOrgId],
  );

  const {
    data: currentUser = null,
    isLoading,
    refetch,
  } = useQuery({
    enabled: shouldFetch,
    initialData: hasInitialBootstrap ? initialUser : undefined,
    initialDataUpdatedAt: hasInitialBootstrap
      ? initialDataUpdatedAt
      : undefined,
    queryFn: async () => {
      if (!effectiveIsSignedIn || !authUserId) {
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
    queryKey,
    staleTime: USER_CONTEXT_CACHE_TTL_MS,
  });

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

  const contextValue = useMemo(
    () => ({
      currentUser,
      isFirstLogin,
      isLoading,
      mutateUser,
      refetchUser,
      setIsFirstLogin: patchMe,
    }),
    [currentUser, isFirstLogin, isLoading, mutateUser, refetchUser, patchMe],
  );

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
}

export function useCurrentUser(): UserContextValue {
  const context = use(UserContext);

  if (context === undefined) {
    throw new Error(
      'useCurrentUser must be used within a UserProvider. The component calling this hook is not wrapped by UserProvider.',
    );
  }

  return context;
}

export function useOptionalUser(): UserContextValue | undefined {
  return use(UserContext);
}
