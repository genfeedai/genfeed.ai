'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/enums';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/clerk.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import {
  type AccessBootstrapState,
  AuthService,
} from '@genfeedai/services/auth/auth.service';
import { loadClientProtectedBootstrap } from '@providers/protected-bootstrap/client-protected-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { createContext, use, useCallback, useMemo } from 'react';

export interface AccessStateContextValue {
  accessState: AccessBootstrapState | null;
  isLoading: boolean;
  refreshAccessState: () => Promise<void>;
  isSuperAdmin: boolean;
  isSubscribed: boolean;
  isByok: boolean;
  hasPaygCredits: boolean;
  canAccessApp: boolean;
  needsOnboarding: boolean;
}

const AccessStateContext = createContext<AccessStateContextValue | undefined>(
  undefined,
);

const ACCESS_STATE_CACHE_TTL_MS = 60_000;

interface AccessStateProviderProps extends LayoutProps {
  initialAccessState?: AccessBootstrapState | null;
}

export function AccessStateProvider({
  children,
  initialAccessState = null,
}: AccessStateProviderProps) {
  const { isLoaded: isAuthLoaded, isSignedIn, orgId, userId } = useAuth();
  const { brandId, organizationId } = useBrand();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? null;

  const getAuthService = useAuthedService((token: string) =>
    AuthService.getInstance(token),
  );

  const shouldFetch =
    effectiveIsAuthLoaded &&
    effectiveIsSignedIn &&
    !!effectiveUserId &&
    !!organizationId;
  const effectiveOrgId = orgId ?? playwrightAuth?.orgId ?? organizationId;
  const clientBootstrapCacheKey =
    shouldFetch && effectiveUserId
      ? `protected-bootstrap:${effectiveUserId}:${effectiveOrgId || 'no-org'}`
      : undefined;

  const {
    data: accessState = null,
    isLoading,
    refetch,
  } = useQuery<AccessBootstrapState | null>({
    enabled: shouldFetch,
    initialData: initialAccessState ?? undefined,
    initialDataUpdatedAt: initialAccessState != null ? 0 : undefined,
    queryFn: async () => {
      if (!shouldFetch) {
        return null;
      }

      const bootstrap = await loadClientProtectedBootstrap(
        clientBootstrapCacheKey,
        getAuthService,
      );

      return bootstrap?.accessState ?? null;
    },
    queryKey: [
      'access-state',
      brandId,
      organizationId,
      effectiveUserId,
      effectiveOrgId,
    ],
    staleTime: ACCESS_STATE_CACHE_TTL_MS,
  });

  const isSuperAdmin = accessState?.isSuperAdmin === true;
  const isSubscribed =
    accessState?.subscriptionStatus === SubscriptionStatus.ACTIVE ||
    accessState?.subscriptionStatus === SubscriptionStatus.TRIALING;
  const isByok = accessState?.subscriptionTier === SubscriptionTier.BYOK;
  const hasPaygCredits =
    (accessState?.creditsBalance ?? 0) > 0 ||
    accessState?.hasEverHadCredits === true;
  const needsOnboarding = accessState?.isOnboardingCompleted !== true;
  const canAccessApp = isSuperAdmin || isSubscribed || isByok;

  const refreshAccessState = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const value = useMemo<AccessStateContextValue>(
    () => ({
      accessState,
      canAccessApp,
      hasPaygCredits,
      isByok,
      isLoading,
      isSubscribed,
      isSuperAdmin,
      needsOnboarding,
      refreshAccessState,
    }),
    [
      accessState,
      canAccessApp,
      hasPaygCredits,
      isByok,
      isLoading,
      isSubscribed,
      isSuperAdmin,
      needsOnboarding,
      refreshAccessState,
    ],
  );

  return (
    <AccessStateContext.Provider value={value}>
      {children}
    </AccessStateContext.Provider>
  );
}

export function useAccessState(): AccessStateContextValue {
  const context = use(AccessStateContext);

  if (!context) {
    throw new Error(
      'useAccessState must be used within an AccessStateProvider.',
    );
  }

  return context;
}
