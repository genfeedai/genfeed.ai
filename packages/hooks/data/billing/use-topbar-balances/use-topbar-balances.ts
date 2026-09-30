'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { shouldShowCreditsNav } from '@genfeedai/config/license';
import type {
  ITopbarBalanceSegment,
  TopbarBalancesSnapshot,
  UseTopbarBalancesReturn,
} from '@genfeedai/contracts/interfaces';
import { CreditsService } from '@genfeedai/services/billing/credits.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useIsDesktopClient } from '@hooks/ui/use-is-desktop-client/use-is-desktop-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * Shared wallet balance for the app shell.
 *
 * The topbar credits chip and the low-credits banner both mount on every
 * protected page and both need the same `/topbar-balances` response. Behind one
 * React Query key they collapse into a single request per navigation instead of
 * two, and a live socket balance published by one of them is visible to both.
 */

/** A socket balance is optimistic; reconcile it against the API shortly after. */
const SOCKET_RECONCILE_DELAY_MS = 1500;
const TOPBAR_BALANCES_STALE_TIME_MS = 30_000;

/** Any surface can ask the shell to re-read the wallet after spending credits. */
const REFRESH_EVENT = 'genfeed:topbar-balances:refresh';

/** A cancelled or deliberately silenced request is not worth a log line. */
interface OptionalBalanceRequestError {
  isCancelled?: boolean;
  silent?: boolean;
}

const EMPTY_SEGMENTS: ITopbarBalanceSegment[] = [];

export function useTopbarBalances(): UseTopbarBalancesReturn {
  const { organizationId } = useBrand();
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    orgId,
    sessionId,
    userId,
  } = useAuthIdentity();
  const isDesktop = useIsDesktopClient();
  const apiEndpoint = EnvironmentService.apiEndpoint;
  const queryClient = useQueryClient();
  const showCredits = shouldShowCreditsNav({
    clientSurface: isDesktop ? 'desktop' : 'web',
  });
  const getCreditsService = useAuthedService(
    (token: string) => new CreditsService(token),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: runtime endpoint getter must invalidate the wallet scope
  const queryKey = useMemo(
    () => [
      'topbar-balances',
      apiEndpoint,
      sessionId,
      userId,
      organizationId ?? 'no-org',
    ],
    [apiEndpoint, sessionId, userId, organizationId],
  );

  const isEnabled =
    showCredits &&
    // Hydration may start with the web snapshot in a hosted Electron page.
    // Never let that cosmetic snapshot authorize a request for unknown desktop context.
    shouldShowCreditsNav() &&
    isAuthLoaded &&
    isSignedIn &&
    Boolean(userId) &&
    Boolean(sessionId) &&
    Boolean(organizationId) &&
    orgId === organizationId;

  const { data, isError, isFetching, isPending, refetch } = useQuery({
    enabled: isEnabled,
    queryFn: async ({ signal }): Promise<TopbarBalancesSnapshot> => {
      try {
        const service = await getCreditsService();
        if (signal.aborted || EnvironmentService.apiEndpoint !== apiEndpoint)
          throw new DOMException('Wallet scope changed', 'AbortError');
        const balances = await service.getTopbarBalances();
        if (signal.aborted || EnvironmentService.apiEndpoint !== apiEndpoint)
          throw new DOMException('Wallet scope changed', 'AbortError');
        const segments = (balances.segments ?? EMPTY_SEGMENTS).filter(
          (segment) =>
            typeof segment.balance === 'number' &&
            Number.isFinite(segment.balance),
        );

        return {
          genfeedBalance:
            segments.find((segment) => segment.provider === 'genfeed')
              ?.balance ?? null,
          segments,
        };
      } catch (error: unknown) {
        const requestError = error as OptionalBalanceRequestError;

        if (
          !signal.aborted &&
          !(error instanceof DOMException && error.name === 'AbortError') &&
          !requestError.isCancelled &&
          !requestError.silent
        ) {
          logger.warn('useTopbarBalances: failed to fetch balances', {
            error,
            reportToSentry: false,
          });
        }

        throw error;
      }
    },
    queryKey,
    // A balance chip does not earn a second round trip when the first fails.
    // The socket and the refresh event both recover it.
    retry: false,
    staleTime: TOPBAR_BALANCES_STALE_TIME_MS,
  });

  const reconcileTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearReconcileTimeout = useCallback(() => {
    if (reconcileTimeoutRef.current) {
      clearTimeout(reconcileTimeoutRef.current);
      reconcileTimeoutRef.current = null;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: cancel reconciliation whenever wallet scope or readiness changes
  useEffect(
    () => clearReconcileTimeout,
    [clearReconcileTimeout, queryKey, isEnabled],
  );

  const publishGenfeedBalance = useCallback(
    (balance: number) => {
      if (!isEnabled || !Number.isFinite(balance)) return;
      queryClient.setQueryData<TopbarBalancesSnapshot>(
        queryKey,
        (previous) => ({
          genfeedBalance: balance,
          segments: previous?.segments ?? EMPTY_SEGMENTS,
        }),
      );

      clearReconcileTimeout();
      reconcileTimeoutRef.current = setTimeout(() => {
        reconcileTimeoutRef.current = null;
        void refetch();
      }, SOCKET_RECONCILE_DELAY_MS);
    },
    [clearReconcileTimeout, isEnabled, queryClient, queryKey, refetch],
  );

  useEffect(() => {
    const handleRefresh = () => {
      if (isEnabled) void refetch();
    };

    window.addEventListener(REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(REFRESH_EVENT, handleRefresh);
    };
  }, [isEnabled, refetch]);

  const refresh = useCallback(async () => {
    if (isEnabled) await refetch();
  }, [isEnabled, refetch]);

  return {
    genfeedBalance:
      isEnabled && !isError ? (data?.genfeedBalance ?? null) : null,
    isLoaded: isEnabled && !isError && data !== undefined,
    // A disabled query stays `pending` forever, which would pin the chip to a
    // skeleton for an org that has no wallet at all.
    isLoading: isEnabled && (isPending || isFetching),
    publishGenfeedBalance,
    refresh,
    segments:
      isEnabled && !isError
        ? (data?.segments ?? EMPTY_SEGMENTS)
        : EMPTY_SEGMENTS,
  };
}
