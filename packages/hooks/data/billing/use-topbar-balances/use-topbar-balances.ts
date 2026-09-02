'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { shouldShowCreditsNav } from '@genfeedai/config/license';
import type {
  ITopbarBalanceSegment,
  TopbarBalancesSnapshot,
  UseTopbarBalancesReturn,
} from '@genfeedai/contracts/interfaces';
import { CreditsService } from '@genfeedai/services/billing/credits.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
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
  const queryClient = useQueryClient();
  const showCredits = shouldShowCreditsNav();
  const getCreditsService = useAuthedService((token: string) =>
    CreditsService.getInstance(token),
  );

  const queryKey = useMemo(
    () => ['topbar-balances', organizationId ?? 'no-org'],
    [organizationId],
  );

  const isEnabled = showCredits && Boolean(organizationId);

  const { data, isFetching, isPending, refetch } = useQuery({
    enabled: isEnabled,
    queryFn: async (): Promise<TopbarBalancesSnapshot> => {
      try {
        const service = await getCreditsService();
        const balances = await service.getTopbarBalances();
        const segments = balances.segments ?? EMPTY_SEGMENTS;

        return {
          genfeedBalance:
            segments.find((segment) => segment.provider === 'genfeed')
              ?.balance ?? null,
          segments,
        };
      } catch (error: unknown) {
        const requestError = error as OptionalBalanceRequestError;

        if (!requestError.isCancelled && !requestError.silent) {
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

  useEffect(() => clearReconcileTimeout, [clearReconcileTimeout]);

  const publishGenfeedBalance = useCallback(
    (balance: number) => {
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
    [clearReconcileTimeout, queryClient, queryKey, refetch],
  );

  useEffect(() => {
    const handleRefresh = () => {
      void refetch();
    };

    window.addEventListener(REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(REFRESH_EVENT, handleRefresh);
    };
  }, [refetch]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    genfeedBalance: data?.genfeedBalance ?? null,
    isLoaded: data !== undefined,
    // A disabled query stays `pending` forever, which would pin the chip to a
    // skeleton for an org that has no wallet at all.
    isLoading: isEnabled && (isPending || isFetching),
    publishGenfeedBalance,
    refresh,
    segments: data?.segments ?? EMPTY_SEGMENTS,
  };
}
