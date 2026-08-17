'use client';

import { isDesktopClient } from '@genfeedai/config/deployment';
import { shouldShowCreditsNav } from '@genfeedai/config/license';
import { APP_ROUTES } from '@genfeedai/constants';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  formatCompactNumber,
  formatNumberWithCommas,
} from '@genfeedai/helpers/formatting/format/format.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useSubscription } from '@genfeedai/hooks/data/subscription/use-subscription/use-subscription';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import type {
  ICreditsEventData,
  IOrganizationEventData,
  ITopbarBalanceSegment,
} from '@genfeedai/interfaces';
import { CreditsService } from '@genfeedai/services/billing/credits.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CreditsBarTrigger from './CreditsBarTrigger';

interface OptionalBalanceRequestError {
  isCancelled?: boolean;
  silent?: boolean;
}

/** Infinity from OSS stub can serialize as null/non-finite — never treat as wallet. */
function coerceFiniteBalance(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function TopbarCreditsBarContent() {
  const { organizationId } = useBrand();
  const { orgHref } = useOrgUrl();
  const showCredits = shouldShowCreditsNav();

  const getCreditsService = useAuthedService((token: string) =>
    CreditsService.getInstance(token),
  );

  const { creditsBreakdown, refreshCreditsBreakdown } = useSubscription();

  // null = not loaded yet. Do not default to 0 or the chip flashes red
  // critical styling before the wallet response lands.
  const [balance, setBalance] = useState<number | null>(null);
  const [segments, setSegments] = useState<ITopbarBalanceSegment[]>([]);
  const [isBalanceLoading, setIsBalanceLoading] = useState(true);
  const refreshBreakdownRef = useRef(refreshCreditsBreakdown);
  const balanceRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const latestBalanceRequestRef = useRef(0);
  refreshBreakdownRef.current = refreshCreditsBreakdown;
  const { isReady: isSocketReady, subscribe, unsubscribe } = useSocketManager();

  const clearTopbarBalanceRefreshTimeout = useCallback(() => {
    const timeout = balanceRefreshTimeoutRef.current;
    if (timeout) {
      clearTimeout(timeout);
      balanceRefreshTimeoutRef.current = null;
    }
  }, []);

  const findTopbarBalances = useCallback(async () => {
    if (!showCredits || !organizationId) {
      return;
    }

    const requestId = latestBalanceRequestRef.current + 1;
    latestBalanceRequestRef.current = requestId;
    setIsBalanceLoading(true);

    try {
      const service = await getCreditsService();
      const data = await service.getTopbarBalances();

      if (requestId !== latestBalanceRequestRef.current) {
        return;
      }

      const nextSegments = data.segments ?? [];
      const genfeedSegment = nextSegments.find(
        (segment) => segment.provider === 'genfeed',
      );
      setSegments(nextSegments);
      setBalance(coerceFiniteBalance(genfeedSegment?.balance));
    } catch (error: unknown) {
      if (requestId !== latestBalanceRequestRef.current) {
        return;
      }

      const requestError = error as OptionalBalanceRequestError;
      if (!requestError.isCancelled && !requestError.silent) {
        logger.warn('TopbarCreditsBar: failed to fetch balances', {
          error,
          reportToSentry: false,
        });
      }
    } finally {
      if (requestId === latestBalanceRequestRef.current) {
        setIsBalanceLoading(false);
      }
    }
  }, [organizationId, getCreditsService, showCredits]);

  const scheduleTopbarBalanceRefresh = useCallback(() => {
    clearTopbarBalanceRefreshTimeout();

    balanceRefreshTimeoutRef.current = setTimeout(() => {
      balanceRefreshTimeoutRef.current = null;
      void findTopbarBalances();
    }, 1500);
  }, [clearTopbarBalanceRefreshTimeout, findTopbarBalances]);

  useEffect(() => {
    // `subscribe` is a silent no-op until the socket manager exists; without
    // this gate a bar mounted before the token resolves never gets live
    // balance updates.
    if (!showCredits || !organizationId || !isSocketReady) {
      return;
    }

    const organizationEvent = `/organizations/${organizationId}`;
    const creditsEvent = `/credits/${organizationId}`;

    const orgHandler = (data: unknown) => {
      const orgData = data as IOrganizationEventData & { balance?: number };
      if (orgData?.balance !== undefined) {
        latestBalanceRequestRef.current += 1;
        setBalance(coerceFiniteBalance(orgData.balance));
        setIsBalanceLoading(false);
        refreshBreakdownRef.current();
        scheduleTopbarBalanceRefresh();
      }
    };

    const creditsHandler = (data: unknown) => {
      const creditsData = data as ICreditsEventData;
      if (creditsData?.balance !== undefined) {
        latestBalanceRequestRef.current += 1;
        setBalance(coerceFiniteBalance(creditsData.balance));
        setIsBalanceLoading(false);
        refreshBreakdownRef.current();
        scheduleTopbarBalanceRefresh();
      }
    };

    subscribe(organizationEvent, orgHandler);
    subscribe(creditsEvent, creditsHandler);

    return () => {
      unsubscribe(organizationEvent, orgHandler);
      unsubscribe(creditsEvent, creditsHandler);
    };
  }, [
    isSocketReady,
    organizationId,
    showCredits,
    subscribe,
    unsubscribe,
    scheduleTopbarBalanceRefresh,
  ]);

  useEffect(
    () => clearTopbarBalanceRefreshTimeout,
    [clearTopbarBalanceRefreshTimeout],
  );

  useEffect(() => {
    const requestRef = latestBalanceRequestRef;

    return () => {
      requestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!showCredits || !organizationId) {
      latestBalanceRequestRef.current += 1;
      setBalance(null);
      setSegments([]);
      setIsBalanceLoading(false);
      return;
    }

    void findTopbarBalances();
  }, [organizationId, findTopbarBalances, showCredits]);

  useEffect(() => {
    const handleRefresh = () => {
      void findTopbarBalances();
    };

    window.addEventListener('genfeed:topbar-balances:refresh', handleRefresh);

    return () => {
      window.removeEventListener(
        'genfeed:topbar-balances:refresh',
        handleRefresh,
      );
    };
  }, [findTopbarBalances]);

  const { planLimit, planBalance, extraBalance, planUsagePercent } =
    useMemo(() => {
      const limit = creditsBreakdown?.planLimit ?? 0;

      if (balance === null) {
        return {
          extraBalance: 0,
          planBalance: 0,
          planLimit: limit,
          planUsagePercent: 0,
        };
      }

      if (limit === 0) {
        return {
          extraBalance: balance,
          planBalance: 0,
          planLimit: 0,
          planUsagePercent: 0,
        };
      }

      const nextPlanBalance = Math.min(balance, limit);
      const nextExtraBalance = Math.max(0, balance - limit);
      const usagePercent = ((limit - nextPlanBalance) / limit) * 100;

      return {
        extraBalance: nextExtraBalance,
        planBalance: nextPlanBalance,
        planLimit: limit,
        planUsagePercent: Math.min(usagePercent, 100),
      };
    }, [balance, creditsBreakdown]);

  const handleRefresh = useCallback(async () => {
    await findTopbarBalances();
    await refreshCreditsBreakdown();
  }, [findTopbarBalances, refreshCreditsBreakdown]);

  if (!showCredits) {
    return null;
  }

  const isLoading = isBalanceLoading && balance === null;
  const compactBalance = balance === null ? '—' : formatCompactNumber(balance);
  const fullBalance = balance === null ? '—' : formatNumberWithCommas(balance);
  const providerSegments = segments.filter(
    (segment) => segment.provider !== 'genfeed',
  );
  const visibleProviderSegments = providerSegments.slice(0, 2);

  const billingHref = orgHref(APP_ROUTES.SETTINGS.CREDITS);

  return (
    <CreditsBarTrigger
      balance={balance}
      billingHref={billingHref}
      fullBalance={fullBalance}
      compactBalance={compactBalance}
      isLoading={isLoading}
      visibleProviderSegments={visibleProviderSegments}
      planLimit={planLimit}
      planBalance={planBalance}
      extraBalance={extraBalance}
      planUsagePercent={planUsagePercent}
      onRefresh={handleRefresh}
    />
  );
}

export default function TopbarCreditsBar() {
  return isDesktopClient() ? null : <TopbarCreditsBarContent />;
}
