'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import type { ITopbarBalanceSegment } from '@genfeedai/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';

type Props = {
  isOpen: boolean;
  fullBalance: string;
  compactBalance: string;
  visibleProviderSegments: ITopbarBalanceSegment[];
  planLimit: number;
  remainingPercent: number;
};

export default function CreditsBarTrigger({
  isOpen,
  fullBalance,
  compactBalance,
  visibleProviderSegments,
  planLimit,
  remainingPercent,
}: Props) {
  return (
    <Button
      withWrapper={false}
      variant={ButtonVariant.UNSTYLED}
      className={cn(
        'hidden h-8 max-w-[20rem] items-center gap-2 rounded-md bg-transparent px-2.5 text-left transition-colors hover:bg-hover sm:flex',
      )}
      data-active={isOpen ? 'true' : 'false'}
      title={`${fullBalance} ${EnvironmentService.CREDITS_LABEL}`}
      ariaLabel={`${fullBalance} ${EnvironmentService.CREDITS_LABEL}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-[11px] font-medium text-foreground/50">
          Credits
        </span>
        <span className="text-[13px] font-semibold tracking-[-0.02em] text-foreground">
          {compactBalance}
        </span>
      </div>
      {visibleProviderSegments.length > 0 && (
        <div className="hidden min-w-0 items-center gap-1 border-l border-foreground/[0.08] pl-2 lg:flex">
          {visibleProviderSegments.map((segment) => (
            <span
              key={segment.provider}
              className={cn(
                'inline-flex h-5 max-w-[5.5rem] items-center gap-1 rounded bg-foreground/[0.04] px-1.5 text-[11px] font-medium text-foreground/62',
                segment.status === 'unavailable' && 'text-warning',
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
        <div className="ml-1 h-1.5 w-14 overflow-hidden rounded-full bg-foreground/[0.08]">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${remainingPercent}%` }}
          />
        </div>
      )}
    </Button>
  );
}
