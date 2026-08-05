'use client';

import { isDesktopClient } from '@genfeedai/config/deployment';
import {
  hasOrganizationBillingHint,
  shouldShowCreditsNav,
} from '@genfeedai/config/license';
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

  const [balance, setBalance] = useState<number>(0);
  const [segments, setSegments] = useState<ITopbarBalanceSegment[]>([]);
  const refreshBreakdownRef = useRef(refreshCreditsBreakdown);
  const balanceRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  refreshBreakdownRef.current = refreshCreditsBreakdown;
  const { subscribe, unsubscribe } = useSocketManager();

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

    try {
      const service = await getCreditsService();
      const data = await service.getTopbarBalances();
      const nextSegments = data.segments ?? [];
      const genfeedSegment = nextSegments.find(
        (segment) => segment.provider === 'genfeed',
      );
      setSegments(nextSegments);
      setBalance(coerceFiniteBalance(genfeedSegment?.balance));
    } catch (error: unknown) {
      const requestError = error as OptionalBalanceRequestError;
      if (!requestError.isCancelled && !requestError.silent) {
        logger.warn('TopbarCreditsBar: failed to fetch balances', {
          error,
          reportToSentry: false,
        });
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
    if (!showCredits || !organizationId) {
      return;
    }

    const organizationEvent = `/organizations/${organizationId}`;
    const creditsEvent = `/credits/${organizationId}`;

    const orgHandler = (data: unknown) => {
      const orgData = data as IOrganizationEventData & { balance?: number };
      if (orgData?.balance !== undefined) {
        setBalance(coerceFiniteBalance(orgData.balance));
        refreshBreakdownRef.current();
        scheduleTopbarBalanceRefresh();
      }
    };

    const creditsHandler = (data: unknown) => {
      const creditsData = data as ICreditsEventData;
      if (creditsData?.balance !== undefined) {
        setBalance(coerceFiniteBalance(creditsData.balance));
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
    if (showCredits && organizationId) {
      void findTopbarBalances();
    }
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
    }, [creditsBreakdown, balance]);

  const handleRefresh = useCallback(async () => {
    await findTopbarBalances();
    await refreshCreditsBreakdown();
  }, [findTopbarBalances, refreshCreditsBreakdown]);

  if (!showCredits) {
    return null;
  }

  const compactBalance = formatCompactNumber(balance);
  const fullBalance = formatNumberWithCommas(balance);
  const providerSegments = segments.filter(
    (segment) => segment.provider !== 'genfeed',
  );
  const visibleProviderSegments = providerSegments.slice(0, 2);

  const billingHref = orgHref(
    hasOrganizationBillingHint()
      ? APP_ROUTES.SETTINGS.BILLING
      : APP_ROUTES.SETTINGS.CREDITS,
  );

  return (
    <CreditsBarTrigger
      balance={balance}
      billingHref={billingHref}
      fullBalance={fullBalance}
      compactBalance={compactBalance}
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
