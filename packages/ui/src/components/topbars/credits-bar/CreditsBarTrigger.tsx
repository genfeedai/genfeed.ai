'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ITopbarBalanceSegment } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Plus } from 'lucide-react';
import Link from 'next/link';

/** Matches LowCreditsBanner — topbar warning tone below this. */
export const TOPBAR_LOW_CREDITS_THRESHOLD = 1000;
const BALANCE_UNAVAILABLE_LABEL = 'Balance unavailable';

type Props = {
  billingHref: string;
  balance: number | null;
  fullBalance: string;
  compactBalance: string;
  /** True while an unknown balance is loading — no red zero flash. */
  isLoading?: boolean;
  visibleProviderSegments: ITopbarBalanceSegment[];
  planLimit: number;
  planBalance: number;
  extraBalance: number;
  planUsagePercent: number;
  /** Silent refresh when the wallet opens (sockets already keep balance live). */
  onRefresh: () => void | Promise<void>;
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
  if (balance < TOPBAR_LOW_CREDITS_THRESHOLD) {
    return 'warning';
  }
  return 'healthy';
}

export default function CreditsBarTrigger({
  billingHref,
  balance,
  fullBalance,
  compactBalance,
  isLoading = false,
  visibleProviderSegments,
  planLimit,
  planBalance,
  extraBalance,
  planUsagePercent,
  onRefresh,
}: Props) {
  const href = billingHref || '/settings/credits';
  const unit = EnvironmentService.CREDITS_LABEL;
  const severity = getBalanceSeverity(balance, isLoading);
  const isLoadingState = severity === 'loading';
  const isUnavailable = severity === 'unavailable';
  const isCritical = severity === 'critical';
  const isWarning = severity === 'warning';
  const isLow = isCritical || isWarning;
  const planUsed = planLimit > 0 ? Math.max(0, planLimit - planBalance) : 0;

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(isOpen) => {
        if (isOpen) {
          void onRefresh();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          textTransform="none"
          data-testid="topbar-credits-trigger"
          data-severity={severity}
          title={
            isLoadingState
              ? `Loading ${unit} balance`
              : isUnavailable
                ? `${unit} balance unavailable`
                : `${fullBalance} ${unit}`
          }
          ariaLabel={
            isLoadingState
              ? `Loading ${unit} balance`
              : isUnavailable
                ? `${unit} balance unavailable. Open wallet.`
                : isCritical
                  ? `Balance empty: 0 ${unit}. Open wallet to buy credits.`
                  : isWarning
                    ? `Balance low: ${fullBalance} ${unit}. Open wallet to buy credits.`
                    : `Balance ${fullBalance} ${unit}. Open wallet.`
          }
          className={cn(
            'hidden h-8 items-center gap-1.5 rounded-md border px-2 shadow-none outline-none ring-0 transition-colors sm:inline-flex',
            'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
            isCritical &&
              'animate-pulse border-destructive/45 bg-destructive/15 text-destructive hover:bg-destructive/20 data-[state=open]:animate-none data-[state=open]:bg-destructive/20 motion-reduce:animate-none',
            isWarning &&
              'border-warning/35 bg-warning/10 text-warning hover:bg-warning/15 data-[state=open]:bg-warning/15',
            (isLoadingState || !isLow) &&
              'border-0 bg-transparent text-foreground hover:bg-hover data-[state=open]:bg-hover',
          )}
        >
          <span
            className={cn(
              'text-sm font-semibold tabular-nums tracking-[-0.02em]',
              isCritical && 'text-destructive',
              isWarning && 'text-warning',
              (isLoadingState || isUnavailable) &&
                'min-w-[2.25ch] text-muted-foreground',
              !isLow && !isLoadingState && !isUnavailable && 'text-foreground',
            )}
          >
            {compactBalance}
          </span>
          <span
            className={cn(
              'text-2xs font-medium uppercase tracking-[0.06em]',
              isCritical && 'text-destructive/80',
              isWarning && 'text-warning/80',
              (isLoadingState || !isLow) && 'text-muted-foreground',
            )}
          >
            {unit}
          </span>
          {isLow ? (
            <span
              className={cn(
                'ml-0.5 size-1.5 shrink-0 rounded-full',
                isCritical && 'bg-destructive',
                isWarning && 'bg-amber-500',
              )}
              aria-hidden
            />
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-56"
        data-testid="topbar-credits-popover"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
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
                    isCritical
                      ? 'text-destructive/80'
                      : 'text-muted-foreground',
                  )}
                >
                  {unit}
                </span>
              </p>
            </div>
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
                {formatCompactNumber(planUsed)} /{' '}
                {formatCompactNumber(planLimit)} plan used
                {extraBalance > 0
                  ? ` · ${formatCompactNumber(extraBalance)} extra`
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
        </DropdownMenuLabel>

        {!isLoadingState && !isUnavailable && planLimit > 0 ? (
          <div className="px-2 pb-2">
            <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
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

        <DropdownMenuSeparator />

        <div
          className={cn(
            'flex flex-col gap-2 p-2 pt-1.5',
            isLow && 'rounded-b-md',
            isCritical && 'bg-destructive/5',
            isWarning && 'bg-amber-500/5',
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
            data-testid="topbar-credits-buy"
          >
            <Link href={href}>
              <Plus className="size-4" aria-hidden />
              Buy credits
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
