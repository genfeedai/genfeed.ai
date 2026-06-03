'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import type { ITopbarBalanceSegment } from '@genfeedai/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { PopoverPanelContent } from '@ui/primitives/popover';
import Link from 'next/link';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { HiArrowPath, HiPlus } from 'react-icons/hi2';

type Props = {
  fullBalance: string;
  planLimit: number;
  planBalance: number;
  extraBalance: number;
  planUsagePercent: number;
  remainingPercent: number;
  providerSegments: ITopbarBalanceSegment[];
  isLoading: boolean;
  settingsHref: string;
  onRefreshBalance: (e?: ReactMouseEvent) => Promise<void>;
  onClose: () => void;
};

export default function CreditsBarPanel({
  fullBalance,
  planLimit,
  planBalance,
  extraBalance,
  planUsagePercent,
  remainingPercent,
  providerSegments,
  isLoading,
  settingsHref,
  onRefreshBalance,
  onClose,
}: Props) {
  return (
    <PopoverPanelContent align="end" className="w-80 rounded-md p-4">
      <div role="dialog" className="space-y-4">
        <div className="rounded-md bg-background-secondary p-4 text-center">
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
          <div className="rounded-md bg-background-secondary p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/36">
                Plan usage
              </span>
              <span className="text-[11px] text-foreground/42">
                {formatCompactNumber(planLimit - planBalance)} /{' '}
                {formatCompactNumber(planLimit)} used
              </span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
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
                  <div className="size-1.5 rounded-full bg-foreground/50" />
                  <span className="text-[11px] text-foreground/40">Plan</span>
                </div>
                {extraBalance > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="size-1.5 rounded-full bg-primary/60" />
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
                  className="flex items-center justify-between gap-3 rounded-md bg-background-secondary px-3 py-2"
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
                        segment.status === 'unavailable' && 'text-amber-200/80',
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
              onRefreshBalance(e);
            }}
            isDisabled={isLoading}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md bg-background-secondary px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-background-tertiary',
              isLoading && 'opacity-50 cursor-not-allowed',
            )}
            title="Refresh Balance"
            ariaLabel="Refresh balance"
          >
            <HiArrowPath
              className={cn(
                'size-4 flex-shrink-0',
                isLoading && 'animate-spin',
              )}
            />
            <span className="text-sm">Refresh</span>
          </Button>

          <Link
            href={settingsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-background-secondary px-3 py-2.5 text-sm font-semibold text-foreground/80 transition-colors hover:bg-background-tertiary"
            data-tone="accent"
            onClick={() => onClose()}
            title="Top Up Credits"
          >
            <HiPlus className="size-4 flex-shrink-0" />
            <span className="text-sm font-medium">Top Up</span>
          </Link>
        </div>
      </div>
    </PopoverPanelContent>
  );
}
