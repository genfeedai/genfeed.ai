'use client';

import { isSaaS } from '@genfeedai/config/deployment';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { SubscriptionStatus } from '@genfeedai/contracts';
import type { ICreditsEventData } from '@genfeedai/contracts/interfaces';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import {
  type AccessBootstrapState,
  AuthService,
} from '@genfeedai/services/auth/auth.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import {
  clearClientProtectedBootstrapCache,
  loadClientProtectedBootstrap,
} from '@providers/protected-bootstrap/client-protected-bootstrap';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useMemo } from 'react';

export interface AccessStateContextValue {
  accessState: AccessBootstrapState | null;
  isLoading: boolean;
  refreshAccessState: () => Promise<void>;
  isSuperAdmin: boolean;
  isSubscribed: boolean;
  /**
   * The org has, or has ever had, Genfeed credits. Durable: it stays true
   * after the balance is spent, so it is not a paywall signal.
   */
  hasPaygCredits: boolean;
  /**
   * The org's current credit balance is above zero. Kept live from the
   * `/credits/{organizationId}` socket so the unpaid-org paywall engages when
   * the last credit is spent and lifts as soon as a purchase lands.
   */
  hasCreditsRemaining: boolean;
  canAccessApp: boolean;
  needsOnboarding: boolean;
  /**
   * First-asset unlock gate (cloud SaaS only). True while the org has not yet
   * generated its first asset and this user has not dismissed the gate — the
   * signal the nav/overlay use to render the locked/teaser state.
   */
  isAssetGateLocked: boolean;
  /** Persist the per-user "explore anyway" escape hatch and unlock immediately. */
  dismissAssetGate: () => Promise<void>;
}

const AccessStateContext = createContext<AccessStateContextValue | undefined>(
  undefined,
);

const ACCESS_STATE_CACHE_TTL_MS = 60_000;

interface AccessStateProviderProps extends LayoutProps {
  hasInitialBootstrap?: boolean;
  initialAccessState?: AccessBootstrapState | null;
}

export function AccessStateProvider({
  children,
  hasInitialBootstrap = false,
  initialAccessState = null,
}: AccessStateProviderProps) {
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    orgId,
    userId,
  } = useAuthIdentity();
  const { brandId, organizationId } = useBrand();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? null;

  const getAuthService = useAuthedService((token: string) =>
    AuthService.getInstance(token),
  );
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const queryClient = useQueryClient();
  const initialDataUpdatedAt = useMemo(() => Date.now(), []);

  const shouldFetch =
    effectiveIsAuthLoaded && effectiveIsSignedIn && !!effectiveUserId;
  const effectiveOrgId = orgId ?? playwrightAuth?.orgId ?? organizationId;
  const clientBootstrapCacheKey =
    shouldFetch && effectiveUserId
      ? `protected-bootstrap:${effectiveUserId}:${effectiveOrgId || 'no-org'}`
      : undefined;

  const accessStateQueryKey = useMemo(
    () => [
      'access-state',
      brandId,
      organizationId,
      effectiveUserId,
      effectiveOrgId,
    ],
    [brandId, organizationId, effectiveUserId, effectiveOrgId],
  );

  const {
    data: accessState = null,
    isLoading,
    refetch,
  } = useQuery<AccessBootstrapState | null>({
    enabled: shouldFetch,
    initialData: hasInitialBootstrap ? initialAccessState : undefined,
    initialDataUpdatedAt: hasInitialBootstrap
      ? initialDataUpdatedAt
      : undefined,
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
    queryKey: accessStateQueryKey,
    staleTime: ACCESS_STATE_CACHE_TTL_MS,
  });

  const isSuperAdmin = accessState?.isSuperAdmin === true;
  const isSubscribed =
    accessState?.subscriptionStatus === SubscriptionStatus.ACTIVE ||
    accessState?.subscriptionStatus === SubscriptionStatus.TRIALING;
  const hasCreditsRemaining = (accessState?.creditsBalance ?? 0) > 0;
  const hasPaygCredits =
    hasCreditsRemaining || accessState?.hasEverHadCredits === true;
  const needsOnboarding = accessState?.isOnboardingCompleted !== true;
  const canAccessApp = isSuperAdmin || isSubscribed;

  // First-asset unlock gate. SaaS-only (isSaaS excludes cloud-connected Desktop);
  // super-admins bypass. Fail-open: locked ONLY when both flags are explicitly
  // false and access state is loaded — a still-loading or older cached payload
  // missing these keys must render children, never flash the locked overlay.
  const isAssetGateLocked =
    isSaaS() &&
    !isSuperAdmin &&
    !isLoading &&
    accessState != null &&
    accessState.hasGeneratedFirstAsset === false &&
    accessState.hasDismissedAssetGate === false;

  // Keep the balance live. Without this the paywall reads a bootstrap snapshot
  // that is up to a minute old: an org that spends its last credit keeps
  // browsing, and an org that just bought credits stays on the paywall.
  const creditsOrganizationId = accessState?.organizationId || organizationId;
  const { isReady: isSocketReady, subscribe } = useSocketManager();

  useEffect(() => {
    if (!isSocketReady || !creditsOrganizationId) {
      return;
    }

    return subscribe<ICreditsEventData>(
      `/credits/${creditsOrganizationId}`,
      (data) => {
        const balance = data?.balance;
        if (typeof balance !== 'number' || !Number.isFinite(balance)) {
          return;
        }

        queryClient.setQueryData<AccessBootstrapState | null>(
          accessStateQueryKey,
          (previous) =>
            previous ? { ...previous, creditsBalance: balance } : previous,
        );
        // A later refetch must not re-serve the pre-change client snapshot
        // over the live balance.
        clearClientProtectedBootstrapCache();
      },
    );
  }, [
    accessStateQueryKey,
    creditsOrganizationId,
    isSocketReady,
    queryClient,
    subscribe,
  ]);

  const refreshAccessState = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const dismissAssetGate = useCallback(async () => {
    // Unlock the UI immediately, independent of the ~60s client bootstrap cache
    // and the API's Redis cache TTL.
    queryClient.setQueryData<AccessBootstrapState | null>(
      accessStateQueryKey,
      (previous) =>
        previous ? { ...previous, hasDismissedAssetGate: true } : previous,
    );

    try {
      const usersService = await getUsersService();
      await usersService.dismissAssetGate();
    } finally {
      // Bust the stale client bootstrap snapshot so the reconciling refetch
      // reads the server's now-updated (and Redis-invalidated) payload rather
      // than re-serving the old locked one and clobbering the optimistic update.
      clearClientProtectedBootstrapCache();
      await refetch();
    }
  }, [accessStateQueryKey, getUsersService, queryClient, refetch]);

  const value = useMemo<AccessStateContextValue>(
    () => ({
      accessState,
      canAccessApp,
      dismissAssetGate,
      hasCreditsRemaining,
      hasPaygCredits,
      isAssetGateLocked,
      isLoading,
      isSubscribed,
      isSuperAdmin,
      needsOnboarding,
      refreshAccessState,
    }),
    [
      accessState,
      canAccessApp,
      dismissAssetGate,
      hasCreditsRemaining,
      hasPaygCredits,
      isAssetGateLocked,
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
