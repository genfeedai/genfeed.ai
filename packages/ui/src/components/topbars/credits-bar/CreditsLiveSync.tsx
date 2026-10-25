'use client';

import { shouldShowCreditsNav } from '@genfeedai/config/license';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type {
  ICreditsEventData,
  IOrganizationEventData,
} from '@genfeedai/contracts/interfaces';
import { useTopbarBalances } from '@genfeedai/hooks/data/billing/use-topbar-balances/use-topbar-balances';
import { useSubscription } from '@genfeedai/hooks/data/subscription/use-subscription/use-subscription';
import { useDesktopRuntimeContext } from '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import { getDesktopCreditsVisibility } from '@genfeedai/services/core/desktop-runtime.service';
import { useEffect, useRef } from 'react';
import { coerceFiniteBalance } from './coerce-finite-balance';

interface CreditsLiveSyncProps {
  refreshCreditsBreakdown: ReturnType<
    typeof useSubscription
  >['refreshCreditsBreakdown'];
}

function CreditsLiveSyncContent({
  refreshCreditsBreakdown,
}: CreditsLiveSyncProps) {
  const { organizationId } = useBrand();
  const runtime = useDesktopRuntimeContext();
  const showCredits = shouldShowCreditsNav(
    getDesktopCreditsVisibility(runtime),
  );
  const { publishGenfeedBalance, refresh: refreshTopbarBalances } =
    useTopbarBalances();

  const refreshBreakdownRef = useRef(refreshCreditsBreakdown);
  refreshBreakdownRef.current = refreshCreditsBreakdown;

  const { isReady: isSocketReady, subscribe, unsubscribe } = useSocketManager();

  useEffect(() => {
    // `subscribe` is a silent no-op until the socket manager exists; without
    // this gate a component mounted before the token resolves never gets live
    // balance updates.
    if (!showCredits || !organizationId || !isSocketReady) {
      return;
    }

    const organizationEvent = `/organizations/${organizationId}`;
    const creditsEvent = `/credits/${organizationId}`;

    const publish = (balance: unknown) => {
      const nextBalance = coerceFiniteBalance(balance);
      if (nextBalance !== null) publishGenfeedBalance(nextBalance);
      else void refreshTopbarBalances();
      refreshBreakdownRef.current();
    };

    const orgHandler = (data: unknown) => {
      const orgData = data as IOrganizationEventData & { balance?: number };
      if (orgData?.balance !== undefined) publish(orgData.balance);
    };

    const creditsHandler = (data: unknown) => {
      const creditsData = data as ICreditsEventData;
      if (creditsData?.balance !== undefined) publish(creditsData.balance);
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
    refreshTopbarBalances,
    showCredits,
    subscribe,
    unsubscribe,
  ]);

  return null;
}

function WebCreditsLiveSync() {
  const { refreshCreditsBreakdown } = useSubscription();
  return <CreditsLiveSyncContent refreshCreditsBreakdown={refreshCreditsBreakdown} />;
}

const noDesktopPlanRefresh = async () => {};

/**
 * Headless. Keeps the shared wallet balance live from socket events on every
 * protected page, since the balance is no longer rendered in the topbar but
 * LowCreditsBanner and the account menu still read it.
 */
export default function CreditsLiveSync() {
  const runtime = useDesktopRuntimeContext();
  if (runtime.status === 'web') return <WebCreditsLiveSync />;
  return (
    <CreditsLiveSyncContent refreshCreditsBreakdown={noDesktopPlanRefresh} />
  );
}
