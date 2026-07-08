'use client';

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

export default function TopbarCreditsBar() {
  const { organizationId } = useBrand();
  const { orgHref } = useOrgUrl();

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
    if (!organizationId) {
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
      setBalance(
        typeof genfeedSegment?.balance === 'number'
          ? genfeedSegment.balance
          : 0,
      );
    } catch (error: unknown) {
      const requestError = error as OptionalBalanceRequestError;
      if (!requestError.isCancelled && !requestError.silent) {
        logger.warn('TopbarCreditsBar: failed to fetch balances', {
          error,
          reportToSentry: false,
        });
      }
    }
  }, [organizationId, getCreditsService]);

  const scheduleTopbarBalanceRefresh = useCallback(() => {
    clearTopbarBalanceRefreshTimeout();

    balanceRefreshTimeoutRef.current = setTimeout(() => {
      balanceRefreshTimeoutRef.current = null;
      void findTopbarBalances();
    }, 1500);
  }, [clearTopbarBalanceRefreshTimeout, findTopbarBalances]);

  useEffect(() => {
    if (organizationId) {
      const organizationEvent = `/organizations/${organizationId}`;
      const creditsEvent = `/credits/${organizationId}`;

      const orgHandler = (data: unknown) => {
        const orgData = data as IOrganizationEventData & { balance?: number };
        if (orgData?.balance !== undefined) {
          setBalance(orgData.balance);
          refreshBreakdownRef.current();
          scheduleTopbarBalanceRefresh();
        }
      };

      const creditsHandler = (data: unknown) => {
        const creditsData = data as ICreditsEventData;
        if (creditsData?.balance !== undefined) {
          setBalance(creditsData.balance);
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
    }
  }, [organizationId, subscribe, unsubscribe, scheduleTopbarBalanceRefresh]);

  useEffect(
    () => clearTopbarBalanceRefreshTimeout,
    [clearTopbarBalanceRefreshTimeout],
  );

  useEffect(() => {
    if (organizationId) {
      (async () => {
        await findTopbarBalances();
      })();
    }
  }, [organizationId, findTopbarBalances]);

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

  const { planLimit, planBalance } = useMemo(() => {
    const limit = creditsBreakdown?.planLimit ?? 0;

    if (limit === 0) {
      return {
        planBalance: 0,
        planLimit: 0,
      };
    }

    return {
      planBalance: Math.min(balance, limit),
      planLimit: limit,
    };
  }, [creditsBreakdown, balance]);

  const compactBalance = formatCompactNumber(balance);
  const fullBalance = formatNumberWithCommas(balance);
  const providerSegments = segments.filter(
    (segment) => segment.provider !== 'genfeed',
  );
  const visibleProviderSegments = providerSegments.slice(0, 2);

  // Remaining percentage for the fill bar (how much is left)
  const remainingPercent = planLimit > 0 ? (planBalance / planLimit) * 100 : 0;
  const billingHref = orgHref(
    process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY
      ? APP_ROUTES.SETTINGS.BILLING
      : APP_ROUTES.SETTINGS.CREDITS,
  );

  return (
    <CreditsBarTrigger
      billingHref={billingHref}
      fullBalance={fullBalance}
      compactBalance={compactBalance}
      visibleProviderSegments={visibleProviderSegments}
      planLimit={planLimit}
      remainingPercent={remainingPercent}
    />
  );
}
