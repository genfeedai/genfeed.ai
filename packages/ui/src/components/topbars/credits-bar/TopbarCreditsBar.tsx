'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
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
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import Link from 'next/link';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiArrowPath, HiPlus } from 'react-icons/hi2';

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
      logger.error('TopbarCreditsBar: failed to fetch balances', error);
      setIsLoading(false);
    }
  }, [organizationId, getCreditsService]);

  useEffect(() => {
    if (organizationId) {
      const organizationEvent = `/organizations/${organizationId}`;
      const creditsEvent = `/credits/${organizationId}`;

      const orgHandler = (data: unknown) => {
        const orgData = data as IOrganizationEventData & { balance?: number };
        if (orgData?.balance !== undefined) {
          setBalance(orgData.balance);
          refreshBreakdownRef.current();
          void findTopbarBalances();
        }
      };

      const creditsHandler = (data: unknown) => {
        const creditsData = data as ICreditsEventData;
        if (creditsData?.balance !== undefined) {
          setBalance(creditsData.balance);
          refreshBreakdownRef.current();
          void findTopbarBalances();
        }
      };

      subscribe(organizationEvent, orgHandler);
      subscribe(creditsEvent, creditsHandler);

      return () => {
        unsubscribe(organizationEvent, orgHandler);
        unsubscribe(creditsEvent, creditsHandler);
      };
    }
  }, [organizationId, subscribe, unsubscribe, findTopbarBalances]);

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
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          className={cn(
            'gen-shell-control hidden h-10 max-w-[20rem] items-center gap-2 rounded-md px-3 text-left sm:flex',
          )}
          data-active={isOpen ? 'true' : 'false'}
          title={`${fullBalance} ${EnvironmentService.CREDITS_LABEL}`}
          ariaLabel={`${fullBalance} ${EnvironmentService.CREDITS_LABEL}`}
        >
          <div className="flex min-w-0 flex-col items-start">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/36">
              Credits
            </span>
            <span className="text-sm font-semibold tracking-[-0.02em] text-foreground">
              {compactBalance}
            </span>
          </div>
          {visibleProviderSegments.length > 0 && (
            <div className="hidden min-w-0 items-center gap-1 border-l border-white/[0.08] pl-2 lg:flex">
              {visibleProviderSegments.map((segment) => (
                <span
                  key={segment.provider}
                  className={cn(
                    'inline-flex h-5 max-w-[5.5rem] items-center gap-1 rounded bg-white/[0.04] px-1.5 text-[11px] font-medium text-foreground/62',
                    segment.status === 'unavailable' && 'text-amber-200/70',
                  )}
                  title={`${segment.label}: ${
                    segment.status === 'available' &&
                    typeof segment.balance === 'number'
                      ? `${formatCompactNumber(segment.balance)} ${segment.currencyOrUnit}`
                      : 'Unavailable'
                  }`}
                >
                  <span className="truncate">{segment.label}</span>
                  <span className="shrink-0 text-foreground/42">
                    {segment.status === 'available' &&
                    typeof segment.balance === 'number'
                      ? formatCompactNumber(segment.balance)
                      : '--'}
                  </span>
                </span>
              ))}
            </div>
          )}
          {planLimit > 0 && (
            <div className="ml-1 h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${remainingPercent}%` }}
              />
            </div>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverPanelContent align="end" className="w-80 rounded-md p-4">
        <div role="dialog" className="space-y-4">
          <div className="gen-shell-surface rounded-md p-4 text-center">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-4xl font-semibold tracking-[-0.05em] text-foreground">
                {fullBalance}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/42">
                {EnvironmentService.CREDITS_LABEL}
              </span>
            </div>
          </div>

          {planLimit > 0 && (
            <div className="gen-shell-surface rounded-md p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/36">
                  Plan usage
                </span>
                <span className="text-[11px] text-foreground/42">
                  {formatCompactNumber(planLimit - planBalance)} /{' '}
                  {formatCompactNumber(planLimit)} used
                </span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="relative transition-all duration-300"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    width:
                      extraBalance > 0
                        ? `${(planLimit / (planLimit + extraBalance)) * 100}%`
                        : '100%',
                  }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                      background: 'rgba(255,255,255,0.55)',
                      width: `${planUsagePercent}%`,
                    }}
                  />
                </div>
                {extraBalance > 0 && (
                  <div
                    className="ml-[2px] rounded-r-full bg-primary/32 transition-all duration-300"
                    style={{
                      width: `${(extraBalance / (planLimit + extraBalance)) * 100}%`,
                    }}
                  />
                )}
              </div>

              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-white/50" />
                    <span className="text-[11px] text-foreground/40">Plan</span>
                  </div>
                  {extraBalance > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      <span className="text-[11px] text-foreground/40">
                        Extra
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-foreground/32">
                  {Math.round(remainingPercent)}% left
                </span>
              </div>
            </div>
          )}

          {providerSegments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/36">
                  Providers
                </span>
                <span className="text-[11px] text-foreground/32">
                  BYOK balances
                </span>
              </div>
              <div className="space-y-1.5">
                {providerSegments.map((segment) => (
                  <div
                    key={segment.provider}
                    className="gen-shell-surface flex items-center justify-between gap-3 rounded-md px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground/86">
                        {segment.label}
                      </div>
                      <div className="text-[11px] text-foreground/38">
                        {segment.status === 'available'
                          ? 'Connected'
                          : (segment.error ?? 'Balance unavailable')}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={cn(
                          'text-sm font-semibold text-foreground',
                          segment.status === 'unavailable' &&
                            'text-amber-200/80',
                        )}
                      >
                        {segment.status === 'available' &&
                        typeof segment.balance === 'number'
                          ? formatCompactNumber(segment.balance)
                          : '--'}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/32">
                        {segment.currencyOrUnit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              onClick={(e) => {
                handleRefreshBalance(e);
              }}
              isDisabled={isLoading}
              className={cn(
                'gen-shell-control flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium',
                isLoading && 'opacity-50 cursor-not-allowed',
              )}
              title="Refresh Balance"
              ariaLabel="Refresh balance"
            >
              <HiArrowPath
                className={cn(
                  'w-4 h-4 flex-shrink-0',
                  isLoading && 'animate-spin',
                )}
              />
              <span className="text-sm">Refresh</span>
            </Button>

            <Link
              href={orgHref('/settings')}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'gen-shell-control flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold',
              )}
              data-tone="accent"
              onClick={() => setIsOpen(false)}
              title="Top Up Credits"
            >
              <HiPlus className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium">Top Up</span>
            </Link>
          </div>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}
