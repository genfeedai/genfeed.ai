'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { formatCreditBalance } from '@genfeedai/contracts/constants';
import type { ITopbarBalanceSegment } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { DropdownMenuSeparator } from '@ui/primitives/dropdown-menu';
import { Plus } from 'lucide-react';
import Link from 'next/link';

/** Matches LowCreditsBanner — warning tone below this. */
export const LOW_CREDITS_THRESHOLD = 1000;
const BALANCE_UNAVAILABLE_LABEL = 'Balance unavailable';

type Props = {
  billingHref: string;
  balance: number | null;
  fullBalance: string;
  /** True while an unknown balance is loading — no red zero flash. */
  isLoading?: boolean;
  visibleProviderSegments: ITopbarBalanceSegment[];
  planLimit: number;
  planUsed: number;
  extraBalance: number;
  planUsagePercent: number;
};

function getBalanceSeverity(
  balance: number | null,
  isLoading: boolean,
): 'critical' | 'warning' | 'healthy' | 'loading' | 'unavailable' {
  if (isLoading) {
    return 'loading';
  }
  if (balance === null) {
    return 'unavailable';
  }
  if (balance <= 0) {
    return 'critical';
  }
  if (balance < LOW_CREDITS_THRESHOLD) {
    return 'warning';
  }
  return 'healthy';
}

/**
 * Credit wallet block for the account menu: balance, plan usage and the
 * Buy credits path. The balance is deliberately not shown in the topbar.
 */
export default function CreditsMenuSection({
  billingHref,
  balance,
  fullBalance,
  isLoading = false,
  visibleProviderSegments,
  planLimit,
  planUsed,
  extraBalance,
  planUsagePercent,
}: Props) {
  const href = billingHref || '/settings/credits';
  const unit = EnvironmentService.CREDITS_LABEL;
  const severity = getBalanceSeverity(balance, isLoading);
  const isLoadingState = severity === 'loading';
  const isUnavailable = severity === 'unavailable';
  const isCritical = severity === 'critical';
  const isWarning = severity === 'warning';
  const isLow = isCritical || isWarning;

  return (
    <div data-testid="account-credits" data-severity={severity}>
      <div className="flex flex-col gap-1 px-2 py-1.5">
        <p
          className={cn(
            'text-sm font-medium leading-none',
            isCritical ? 'text-destructive' : 'text-foreground',
          )}
        >
          <span className="tabular-nums">{fullBalance}</span>
          <span
            className={cn(
              'ml-1 text-2xs font-medium uppercase tracking-[0.08em]',
              isCritical ? 'text-destructive/80' : 'text-muted-foreground',
            )}
          >
            {unit}
          </span>
        </p>
        {isLoadingState ? (
          <p className="text-xs leading-none text-muted-foreground">
            Loading balance…
          </p>
        ) : isUnavailable ? (
          <p className="text-xs leading-none text-muted-foreground">
            {BALANCE_UNAVAILABLE_LABEL}
          </p>
        ) : planLimit > 0 ? (
          <p className="text-xs leading-none text-muted-foreground">
            {formatCreditBalance(planUsed)} / {formatCreditBalance(planLimit)}{' '}
            plan used
            {extraBalance > 0
              ? ` · ${formatCreditBalance(extraBalance)} extra`
              : ''}
          </p>
        ) : (
          <p className="text-xs leading-none text-muted-foreground">
            {isCritical
              ? 'No credits left — top up to generate'
              : 'Available balance'}
          </p>
        )}
      </div>

      {!isLoadingState && !isUnavailable && planLimit > 0 ? (
        <div className="px-2 pb-2">
          <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
            <div
              className={cn(
                'h-full rounded-full transition-[width,background-color] duration-500 motion-reduce:transition-none',
                isCritical ? 'bg-destructive' : 'bg-foreground/45',
              )}
              style={{ width: `${Math.min(planUsagePercent, 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {visibleProviderSegments.length > 0 ? (
        <>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <p className="mb-1.5 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Providers
            </p>
            <div className="flex flex-col gap-1">
              {visibleProviderSegments.map((segment) => (
                <div
                  key={segment.provider}
                  className="flex items-center justify-between gap-2 text-xs text-foreground/70"
                >
                  <span className="truncate">{segment.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {segment.status === 'available' &&
                    typeof segment.balance === 'number'
                      ? formatCompactNumber(segment.balance)
                      : '--'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-2 p-2 pt-1',
          isCritical && 'rounded-md bg-destructive/5',
          isWarning && 'rounded-md bg-amber-500/5',
        )}
      >
        {isLow ? (
          <p
            className={cn(
              'px-0.5 text-2xs leading-snug',
              isCritical && 'font-medium text-destructive',
              isWarning && 'text-warning',
            )}
          >
            {isCritical
              ? 'You are out of credits. Buy more to keep generating.'
              : 'Running low. Top up before generations stall.'}
          </p>
        ) : null}
        <Button
          asChild
          withWrapper={false}
          variant={
            isCritical ? ButtonVariant.DESTRUCTIVE : ButtonVariant.DEFAULT
          }
          textTransform="none"
          className="h-9 w-full justify-center gap-1.5"
          data-testid="account-credits-buy"
        >
          <Link href={href}>
            <Plus className="size-4" aria-hidden />
            Buy credits
          </Link>
        </Button>
      </div>
    </div>
  );
}
