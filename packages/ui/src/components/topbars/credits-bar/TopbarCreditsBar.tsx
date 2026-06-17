'use client';

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
import { Popover, PopoverTrigger } from '@ui/primitives/popover';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CreditsBarPanel from './CreditsBarPanel';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const refreshBreakdownRef = useRef(refreshCreditsBreakdown);
  const balanceRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  refreshBreakdownRef.current = refreshCreditsBreakdown;
  const { subscribe, unsubscribe } = useSocketManager();

  const findTopbarBalances = useCallback(async () => {
    if (!organizationId) {
      return setIsLoading(false);
    }

    try {
      setIsLoading(true);
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
      setIsLoading(false);
    } catch (error: unknown) {
      const requestError = error as OptionalBalanceRequestError;
      if (!requestError.isCancelled && !requestError.silent) {
        logger.warn('TopbarCreditsBar: failed to fetch balances', {
          error,
          reportToSentry: false,
        });
      }
      setIsLoading(false);
    }
  }, [organizationId, getCreditsService]);

  const scheduleTopbarBalanceRefresh = useCallback(() => {
    if (balanceRefreshTimeoutRef.current) {
      clearTimeout(balanceRefreshTimeoutRef.current);
    }

    balanceRefreshTimeoutRef.current = setTimeout(() => {
      balanceRefreshTimeoutRef.current = null;
      void findTopbarBalances();
    }, 1500);
  }, [findTopbarBalances]);

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

  useEffect(() => {
    return () => {
      if (balanceRefreshTimeoutRef.current) {
        clearTimeout(balanceRefreshTimeoutRef.current);
      }
    };
  }, []);

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

  const handleRefreshBalance = async (e?: ReactMouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    await findTopbarBalances();
    await refreshCreditsBreakdown();
  };

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

      const planBal = Math.min(balance, limit);
      const extraBal = Math.max(0, balance - limit);
      const usagePercent = ((limit - planBal) / limit) * 100;

      return {
        extraBalance: extraBal,
        planBalance: planBal,
        planLimit: limit,
        planUsagePercent: Math.min(usagePercent, 100),
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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <CreditsBarTrigger
          isOpen={isOpen}
          fullBalance={fullBalance}
          compactBalance={compactBalance}
          visibleProviderSegments={visibleProviderSegments}
          planLimit={planLimit}
          remainingPercent={remainingPercent}
        />
      </PopoverTrigger>

      <CreditsBarPanel
        fullBalance={fullBalance}
        planLimit={planLimit}
        planBalance={planBalance}
        extraBalance={extraBalance}
        planUsagePercent={planUsagePercent}
        remainingPercent={remainingPercent}
        providerSegments={providerSegments}
        isLoading={isLoading}
        settingsHref={orgHref('/settings')}
        onRefreshBalance={handleRefreshBalance}
        onClose={() => setIsOpen(false)}
      />
    </Popover>
  );
}
