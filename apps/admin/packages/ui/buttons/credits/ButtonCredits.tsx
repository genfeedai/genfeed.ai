'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import type {
  ICreditsEventData,
  IOrganizationEventData,
} from '@genfeedai/interfaces';
import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import {
  formatCompactNumber,
  formatNumberWithCommas,
} from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import type { ButtonCreditsProps } from '@props/ui/forms/button-credits.props';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Button from '@ui/buttons/base/Button';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import Link from 'next/link';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiArrowPath, HiPlus } from 'react-icons/hi2';

export default function ButtonCredits({
  isCompact = false,
}: ButtonCreditsProps = {}) {
  const { organizationId } = useBrand();

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const { creditsBreakdown, refreshCreditsBreakdown } = useSubscription();

  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const refreshBreakdownRef = useRef(refreshCreditsBreakdown);
  refreshBreakdownRef.current = refreshCreditsBreakdown;
  const { subscribe, unsubscribe } = useSocketManager();

  useEffect(() => {
    if (organizationId) {
      const organizationEvent = `/organizations/${organizationId}`;
      const creditsEvent = `/credits/${organizationId}`;

      const orgHandler = (data: unknown) => {
        const orgData = data as IOrganizationEventData & { balance?: number };
        if (orgData?.balance !== undefined) {
          setBalance(orgData.balance);
          refreshBreakdownRef.current();
        }
      };

      const creditsHandler = (data: unknown) => {
        const creditsData = data as ICreditsEventData;
        if (creditsData?.balance !== undefined) {
          setBalance(creditsData.balance);
          refreshBreakdownRef.current();
        }
      };

      subscribe(organizationEvent, orgHandler);
      subscribe(creditsEvent, creditsHandler);

      return () => {
        unsubscribe(organizationEvent, orgHandler);
        unsubscribe(creditsEvent, creditsHandler);
      };
    }
  }, [organizationId, subscribe, unsubscribe]);

  const findOrganizationBalance = useCallback(async () => {
    if (!organizationId) {
      logger.error('findOrganizationBalance: organizationId not available');
      return setIsLoading(false);
    }

    const url = `GET /organizations/${organizationId}/settings`;

    try {
      setIsLoading(true);

      const service = await getOrganizationsService();
      const data = await service.findOne(organizationId);

      const balance = data?.balance ?? 0;
      setBalance(balance);

      logger.info(`${url} success`, {
        balance,
        organizationId,
      });

      setIsLoading(false);
    } catch (error: unknown) {
      logger.error(`${url} failed`, error);
      setIsLoading(false);
    }
  }, [organizationId, getOrganizationsService]);

  useEffect(() => {
    if (organizationId) {
      (async () => {
        await findOrganizationBalance();
      })();
    }
  }, [organizationId, findOrganizationBalance]);

  const handleRefreshBalance = async (e?: ReactMouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    await findOrganizationBalance();
    await refreshCreditsBreakdown();
  };

  // Derive plan vs extra credits from breakdown
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

      // Plan credits = min(balance, planLimit)
      // Extra credits = anything above the plan limit
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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          className={cn(
            'flex transition-all hover:bg-white/10',
            isCompact
              ? 'min-h-[40px] min-w-[40px] items-center justify-center px-2 py-2'
              : 'w-full flex-col items-center gap-2 px-2 py-2.5',
            isOpen && 'bg-white/10',
          )}
          title={`${fullBalance} ${EnvironmentService.CREDITS_LABEL}`}
          ariaLabel={`${fullBalance} ${EnvironmentService.CREDITS_LABEL}`}
        >
          <span
            className={cn(
              'font-bold leading-none text-white',
              isCompact ? 'text-sm' : 'text-base',
            )}
          >
            {compactBalance}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverPanelContent
        align="start"
        className={cn(BG_BLUR, BORDER_WHITE_30, 'w-72 p-3')}
      >
        <div>
          {/* Balance Display */}
          <div className="mb-3">
            <div className="flex items-baseline gap-2 justify-center">
              <span className="text-3xl font-bold text-white">
                {fullBalance}
              </span>
              <span className="text-sm text-white/60 uppercase tracking-wide">
                {EnvironmentService.CREDITS_LABEL}
              </span>
            </div>
          </div>

          {/* Usage Bar */}
          {planLimit > 0 && (
            <div className="mb-3">
              {/* Bar */}
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                {/* Plan section */}
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
                  {/* Plan used fill */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                      background: 'rgba(255,255,255,0.55)',
                      width: `${planUsagePercent}%`,
                    }}
                  />
                </div>
                {/* Extra credits section */}
                {extraBalance > 0 && (
                  <div
                    className="ml-[2px] rounded-r-full transition-all duration-300 bg-primary/40"
                    style={{
                      width: `${(extraBalance / (planLimit + extraBalance)) * 100}%`,
                    }}
                  />
                )}
              </div>

              {/* Labels */}
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
                    <span className="text-[11px] text-white/40">Plan</span>
                  </div>
                  {extraBalance > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                      <span className="text-[11px] text-white/40">Extra</span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-white/30">
                  {formatCompactNumber(planLimit - planBalance)} /{' '}
                  {formatCompactNumber(planLimit)} used
                </span>
              </div>
            </div>
          )}

          {/* Actions - Side by Side */}
          <div className="flex gap-2">
            {/* Refresh Balance */}
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              onClick={(e) => {
                handleRefreshBalance(e);
              }}
              isDisabled={isLoading}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 transition-all text-white',
                'hover:bg-white/10 border border-white/[0.08]',
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

            {/* Top Up */}
            <Link
              href={`${EnvironmentService.apps.app}/settings/organization`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 transition-all text-white',
                'bg-primary/10 hover:bg-primary/20 border border-primary/30',
              )}
              onClick={() => setIsOpen(false)}
              title="Top Up Credits"
            >
              <HiPlus className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-black">Top Up</span>
            </Link>
          </div>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}
