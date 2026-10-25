'use client';

import { shouldShowCreditsNav } from '@genfeedai/config/license';
import {
  APP_ROUTES,
  formatCreditBalanceExact,
} from '@genfeedai/contracts/constants';
import { useTopbarBalances } from '@genfeedai/hooks/data/billing/use-topbar-balances/use-topbar-balances';
import { useSubscription } from '@genfeedai/hooks/data/subscription/use-subscription/use-subscription';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useDesktopRuntimeContext } from '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';
import { getDesktopCreditsVisibility } from '@genfeedai/services/core/desktop-runtime.service';
import { DropdownMenuSeparator } from '@ui/primitives/dropdown-menu';
import { useEffect, useMemo, useRef } from 'react';
import CreditsMenuSection from './CreditsMenuSection';
import { coerceFiniteBalance } from './coerce-finite-balance';
import { getPlanUsage } from './plan-usage';

interface AccountCreditsPlanProps {
  creditsBreakdown: ReturnType<typeof useSubscription>['creditsBreakdown'];
  refreshCreditsBreakdown: ReturnType<
    typeof useSubscription
  >['refreshCreditsBreakdown'];
}

function AccountCreditsContent({
  creditsBreakdown,
  refreshCreditsBreakdown,
}: AccountCreditsPlanProps) {
  const { orgHref } = useOrgUrl();
  const runtime = useDesktopRuntimeContext();
  const showCredits = shouldShowCreditsNav(
    getDesktopCreditsVisibility(runtime),
  );

  // Shared with LowCreditsBanner and CreditsLiveSync, which mount on every
  // protected page. One query key means one request per navigation.
  const {
    genfeedBalance,
    isLoaded,
    isLoading: isBalanceLoading,
    refresh: refreshTopbarBalances,
    segments,
  } = useTopbarBalances();

  // null = not loaded yet. Do not default to 0 or the wallet flashes red
  // critical styling before the response lands.
  const balance = isLoaded ? coerceFiniteBalance(genfeedBalance) : null;

  const refreshWallet = async () => {
    await refreshTopbarBalances();
    await refreshCreditsBreakdown();
  };
  const refreshRef = useRef(refreshWallet);
  refreshRef.current = refreshWallet;

  // The menu content mounts when the menu opens: re-read the wallet then, so a
  // balance older than the stale window is never shown.
  useEffect(() => {
    void refreshRef.current();
  }, []);

  const { planLimit, planUsed, extraBalance, planUsagePercent } =
    useMemo(
      () =>
        getPlanUsage({
          balance,
          cycleUsed: creditsBreakdown?.cycleUsed ?? 0,
          planLimit: creditsBreakdown?.planLimit ?? 0,
        }),
      [balance, creditsBreakdown],
    );

  if (!showCredits) {
    return null;
  }

  const isLoading = isBalanceLoading && balance === null;
  const fullBalance =
    balance === null ? '—' : formatCreditBalanceExact(balance);
  const visibleProviderSegments = segments
    .filter((segment) => segment.provider !== 'genfeed')
    .slice(0, 2);

  return (
    <>
      <CreditsMenuSection
        balance={balance}
        billingHref={orgHref(APP_ROUTES.SETTINGS.CREDITS)}
        extraBalance={extraBalance}
        fullBalance={fullBalance}
        isLoading={isLoading}
        planLimit={planLimit}
        planUsagePercent={planUsagePercent}
        planUsed={planUsed}
        visibleProviderSegments={visibleProviderSegments}
      />
      <DropdownMenuSeparator />
    </>
  );
}

function WebAccountCredits() {
  const { creditsBreakdown, refreshCreditsBreakdown } = useSubscription();
  return (
    <AccountCreditsContent
      creditsBreakdown={creditsBreakdown}
      refreshCreditsBreakdown={refreshCreditsBreakdown}
    />
  );
}

const noDesktopPlanRefresh = async () => {};

/** Wallet block for the account menu; renders nothing without a wallet. */
export default function AccountCredits() {
  const runtime = useDesktopRuntimeContext();
  if (runtime.status === 'web') return <WebAccountCredits />;
  return (
    <AccountCreditsContent
      creditsBreakdown={null}
      refreshCreditsBreakdown={noDesktopPlanRefresh}
    />
  );
}
