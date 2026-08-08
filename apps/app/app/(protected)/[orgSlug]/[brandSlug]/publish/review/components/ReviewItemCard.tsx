'use client';

import {
  BatchItemStatus,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Button } from '@ui/primitives/button';
import { Check } from 'lucide-react';
import Image from 'next/image';
import { useMemo } from 'react';

import {
  formatReviewItemStatus,
  getReviewItemTitle,
  isReviewItemSelectable,
} from './review-item.helpers';
import {
  getReviewPerformanceLabel,
  getReviewPerformanceSignal,
} from './review-performance';
import { isApproved } from './review-state';

interface ReviewItemCardProps {
  isActive: boolean;
  isSelected: boolean;
  item: IBatchItem;
  onSelect: () => void;
  onToggleSelect: (itemId: string) => void;
}

export default function ReviewItemCard({
  isActive,
  isSelected,
  item,
  onSelect,
  onToggleSelect,
}: ReviewItemCardProps) {
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const formattedDate = item.scheduledDate
    ? formatDateInTimezone(item.scheduledDate, browserTimezone, 'MMM d')
    : null;
  const isActionable = isReviewItemSelectable(item);
  const performanceSignal = getReviewPerformanceSignal(item);
  const performanceLabel = getReviewPerformanceLabel(performanceSignal);
  const displayStatus = formatReviewItemStatus(item);
  const title = getReviewItemTitle(item);

  return (
    <div
      className={cn(
        'group rounded-card bg-card p-3 shadow-border transition-[background-color,box-shadow]',
        isActive
          ? 'bg-primary/[0.06] shadow-border-strong'
          : 'hover:bg-foreground/[0.03]',
        isSelected ? 'ring-1 ring-primary/30' : '',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {item.platform ? (
                <PlatformBadge
                  platform={item.platform}
                  size={ComponentSize.SM}
                />
              ) : null}
              <Badge
                status={isApproved(item) ? 'completed' : item.status}
                size={ComponentSize.SM}
              >
                {displayStatus}
              </Badge>
              {performanceLabel ? (
                <span
                  className={cn(
                    'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                    performanceSignal === 'winning'
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                      : performanceSignal === 'underperforming'
                        ? 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                        : 'border-amber-500/30 bg-amber-500/15 text-amber-200',
                  )}
                >
                  {performanceLabel}
                </span>
              ) : null}
            </div>

            {isActionable ? (
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => onToggleSelect(item.id)}
                ariaLabel={isSelected ? 'Deselect item' : 'Select item'}
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground/50 hover:border-border-strong hover:text-foreground/75',
                )}
              >
                {isSelected ? <Check className="size-3" /> : null}
              </Button>
            ) : null}
          </div>

          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={onSelect}
            className="mt-2 w-full text-left"
          >
            <p className="line-clamp-2 text-sm font-medium text-foreground">
              {title}
            </p>
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {[
                item.format ? String(item.format) : null,
                formattedDate,
                item.postId ? 'Draft linked' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Post draft'}
            </p>
          </Button>
        </div>

        {/* Media is secondary — only show when we actually have a preview. */}
        {item.mediaUrl ? (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={onSelect}
            className="relative size-14 shrink-0 overflow-hidden rounded-card bg-background-secondary shadow-border"
            aria-label="Open media preview"
          >
            <Image
              src={item.mediaUrl}
              alt=""
              fill
              className="object-cover"
              sizes="56px"
            />
          </Button>
        ) : null}
      </div>

      {item.status === BatchItemStatus.FAILED && item.error ? (
        <p className="mt-2 rounded-card border border-destructive/20 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
          {item.error}
        </p>
      ) : null}
    </div>
  );
}
