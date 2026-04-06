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
import {
  getReviewPerformanceLabel,
  getReviewPerformanceSignal,
} from '@pages/review/components/review-performance';
import {
  isApproved,
  isChangesRequested,
  isReadyToReview,
} from '@pages/review/components/review-state';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Image from 'next/image';
import { useMemo } from 'react';
import { HiCheck, HiPhoto } from 'react-icons/hi2';

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
  const isActionable = isReadyToReview(item);
  const performanceSignal = getReviewPerformanceSignal(item);
  const performanceLabel = getReviewPerformanceLabel(performanceSignal);
  const displayStatus = isApproved(item)
    ? 'Approved'
    : isChangesRequested(item)
      ? 'Changes requested'
      : item.reviewDecision === 'rejected'
        ? 'Rejected'
        : item.status;

  return (
    <div
      className={cn(
        'group rounded-xl border bg-neutral-950/70 p-3 transition-all',
        isActive
          ? 'border-primary/50 bg-primary/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]'
          : 'border-white/10 hover:border-white/20',
        isSelected ? 'ring-1 ring-primary/30' : '',
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-900"
        >
          {item.mediaUrl ? (
            <Image
              src={item.mediaUrl}
              alt={item.caption ?? 'Batch item'}
              fill
              className="object-cover"
              sizes="80px"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-600">
              <HiPhoto className="h-6 w-6" />
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {item.platform && (
                <PlatformBadge
                  platform={item.platform}
                  size={ComponentSize.SM}
                />
              )}
              <Badge
                status={isApproved(item) ? 'completed' : item.status}
                size={ComponentSize.SM}
              >
                {displayStatus}
              </Badge>
              {performanceLabel && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    performanceSignal === 'winning'
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                      : performanceSignal === 'underperforming'
                        ? 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                        : 'border-amber-500/30 bg-amber-500/15 text-amber-200',
                  )}
                >
                  {performanceLabel}
                </span>
              )}
              <Badge status={item.format} size={ComponentSize.SM} />
            </div>

            {isActionable && (
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => onToggleSelect(item.id)}
                ariaLabel={isSelected ? 'Deselect item' : 'Select item'}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded border transition-all',
                  isSelected
                    ? 'border-primary bg-primary text-white'
                    : 'border-white/15 bg-white/[0.03] text-foreground/50 hover:border-white/25 hover:text-foreground/75',
                )}
              >
                {isSelected && <HiCheck className="h-3 w-3" />}
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={onSelect}
            className="mt-2 w-full text-left"
          >
            <p className="line-clamp-2 text-sm text-foreground/85">
              {item.caption ?? 'No caption generated'}
            </p>
          </button>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/45">
            {formattedDate && <span>{formattedDate}</span>}
            {item.prompt && <span className="truncate">Prompt ready</span>}
            {item.postTotalViews !== undefined && (
              <span>{item.postTotalViews.toLocaleString()} views</span>
            )}
            {item.postAvgEngagementRate !== undefined && (
              <span>{item.postAvgEngagementRate.toFixed(1)}% engagement</span>
            )}
            {!item.mediaUrl && <span>Media pending</span>}
          </div>
        </div>
      </div>

      {item.status === BatchItemStatus.FAILED && item.error && (
        <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {item.error}
        </p>
      )}
    </div>
  );
}
