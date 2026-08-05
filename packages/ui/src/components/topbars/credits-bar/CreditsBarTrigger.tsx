'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import type { ITopbarBalanceSegment } from '@genfeedai/interfaces';
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

type Props = {
  billingHref: string;
  balance: number;
  fullBalance: string;
  compactBalance: string;
  visibleProviderSegments: ITopbarBalanceSegment[];
  planLimit: number;
  planBalance: number;
  extraBalance: number;
  planUsagePercent: number;
  /** Silent refresh when the wallet opens (sockets already keep balance live). */
  onRefresh: () => void | Promise<void>;
};

function getBalanceSeverity(
  balance: number,
): 'critical' | 'warning' | 'healthy' {
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
  visibleProviderSegments,
  planLimit,
  planBalance,
  extraBalance,
  planUsagePercent,
  onRefresh,
}: Props) {
  const href = billingHref || '/settings/billing';
  const unit = EnvironmentService.CREDITS_LABEL;
  const severity = getBalanceSeverity(balance);
  const isLow = severity !== 'healthy';
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
          title={`${fullBalance} ${unit}`}
          ariaLabel={`Balance ${fullBalance} ${unit}. Open wallet.`}
          className={cn(
            'hidden h-8 items-center gap-1.5 rounded-md border-0 bg-transparent px-2 shadow-none outline-none ring-0 transition-colors sm:inline-flex',
            'hover:bg-hover focus:outline-none focus:ring-0 focus-visible:bg-hover focus-visible:outline-none focus-visible:ring-0',
            'data-[state=open]:bg-hover',
          )}
        >
          <span
            className={cn(
              'text-[13px] font-semibold tabular-nums tracking-[-0.02em] text-foreground',
              isLow && 'text-foreground/90',
            )}
          >
            {compactBalance}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {unit}
          </span>
          {isLow ? (
            <span
              className="ml-0.5 size-1.5 shrink-0 rounded-full bg-foreground/45"
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
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium leading-none text-foreground">
                <span className="tabular-nums">{fullBalance}</span>
                <span className="ml-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {unit}
                </span>
              </p>
              {isLow ? (
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  {severity === 'critical' ? 'Empty' : 'Low'}
                </span>
              ) : null}
            </div>
            {planLimit > 0 ? (
              <p className="text-xs leading-none text-muted-foreground">
                {formatCompactNumber(planUsed)} /{' '}
                {formatCompactNumber(planLimit)} plan used
                {extraBalance > 0
                  ? ` · ${formatCompactNumber(extraBalance)} extra`
                  : ''}
              </p>
            ) : (
              <p className="text-xs leading-none text-muted-foreground">
                Available balance
              </p>
            )}
          </div>
        </DropdownMenuLabel>

        {planLimit > 0 ? (
          <div className="px-2 pb-2">
            <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
              <div
                className="h-full rounded-full bg-foreground/45 transition-all duration-500"
                style={{ width: `${Math.min(planUsagePercent, 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {visibleProviderSegments.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Providers
              </p>
              <div className="flex flex-col gap-1">
                {visibleProviderSegments.map((segment) => (
                  <div
                    key={segment.provider}
                    className="flex items-center justify-between gap-2 text-[12px] text-foreground/70"
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

        <div className="p-2 pt-1.5">
          <Button
            asChild
            withWrapper={false}
            variant={ButtonVariant.DEFAULT}
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
