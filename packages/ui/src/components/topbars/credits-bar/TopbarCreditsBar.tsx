'use client';

import { isDesktopClient } from '@genfeedai/config/deployment';
import { shouldShowCreditsNav } from '@genfeedai/config/license';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  ICreditsEventData,
  IOrganizationEventData,
} from '@genfeedai/contracts/interfaces';
import {
  formatCompactNumber,
  formatNumberWithCommas,
} from '@genfeedai/helpers/formatting/format/format.helper';
import { useTopbarBalances } from '@genfeedai/hooks/data/billing/use-topbar-balances/use-topbar-balances';
import { useSubscription } from '@genfeedai/hooks/data/subscription/use-subscription/use-subscription';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import CreditsBarTrigger from './CreditsBarTrigger';

/** Infinity from OSS stub can serialize as null/non-finite — never treat as wallet. */
function coerceFiniteBalance(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function TopbarCreditsBarContent() {
  const { organizationId } = useBrand();
  const { orgHref } = useOrgUrl();
  const showCredits = shouldShowCreditsNav();

  const { creditsBreakdown, refreshCreditsBreakdown } = useSubscription();

  // Shared with LowCreditsBanner, which mounts alongside this chip on every
  // protected page. One query key means one request per navigation, and the
  // live balances published below reach the banner through the same cache.
  const {
    genfeedBalance,
    isLoaded,
    isLoading: isBalanceLoading,
    publishGenfeedBalance,
    refresh: refreshTopbarBalances,
    segments,
  } = useTopbarBalances();

  // null = not loaded yet. Do not default to 0 or the chip flashes red
  // critical styling before the wallet response lands.
  const balance = isLoaded ? coerceFiniteBalance(genfeedBalance) : null;

  const refreshBreakdownRef = useRef(refreshCreditsBreakdown);
  refreshBreakdownRef.current = refreshCreditsBreakdown;

  const { isReady: isSocketReady, subscribe, unsubscribe } = useSocketManager();

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
        publishGenfeedBalance(coerceFiniteBalance(orgData.balance));
        refreshBreakdownRef.current();
      }
    };

    const creditsHandler = (data: unknown) => {
      const creditsData = data as ICreditsEventData;
      if (creditsData?.balance !== undefined) {
        publishGenfeedBalance(coerceFiniteBalance(creditsData.balance));
        refreshBreakdownRef.current();
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
    publishGenfeedBalance,
    showCredits,
    subscribe,
    unsubscribe,
  ]);

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
    await refreshTopbarBalances();
    await refreshCreditsBreakdown();
  }, [refreshCreditsBreakdown, refreshTopbarBalances]);

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
