'use client';

import { BatchItemStatus } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Clock, ImageIcon, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { useMemo } from 'react';

import ReviewDetailPanelAside from './ReviewDetailPanelAside';
import ReviewDetailPanelEmpty from './ReviewDetailPanelEmpty';
import ReviewDetailPanelHeader from './ReviewDetailPanelHeader';
import {
  isApproved,
  isChangesRequested,
  isReadyToReview,
} from './review-state';

type ReviewPanelItem = IBatchItem & {
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
};

interface ReviewDetailPanelProps {
  isActioning: boolean;
  isSelected: boolean;
  item: ReviewPanelItem | null;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
}

function buildStatusLabel(item: ReviewPanelItem): string {
  if (isApproved(item)) {
    return 'Approved';
  }

  if (isChangesRequested(item)) {
    return 'Changes requested';
  }

  if (item.reviewDecision === 'rejected') {
    return 'Rejected';
  }

  switch (item.status) {
    case BatchItemStatus.COMPLETED:
      return 'Ready to review';
    case BatchItemStatus.FAILED:
      return 'Generation failed';
    case BatchItemStatus.PROCESSING:
      return 'Generating';
    case BatchItemStatus.PENDING:
      return 'Pending';
    case BatchItemStatus.SKIPPED:
      return 'Rejected';
    default:
      return item.status;
  }
}

export default function ReviewDetailPanel({
  isActioning,
  isSelected,
  item,
  onApprove,
  onRequestChanges,
  onReject,
  onToggleSelect,
}: ReviewDetailPanelProps) {
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  if (!item) {
    return <ReviewDetailPanelEmpty />;
  }

  const formattedScheduledDate = item.scheduledDate
    ? formatDateInTimezone(
        item.scheduledDate,
        browserTimezone,
        'MMM d, yyyy h:mm a',
      )
    : null;
  const formattedCreatedDate = formatDateInTimezone(
    item.createdAt,
    browserTimezone,
    'MMM d, yyyy h:mm a',
  );
  const isReady = isReadyToReview(item);
  const statusLabel = buildStatusLabel(item);
  const reviewEvents = (item.reviewEvents ?? []).toSorted((left, right) =>
    right.reviewedAt.localeCompare(left.reviewedAt),
  );
  const caption =
    item.caption?.trim() ||
    item.prompt?.trim() ||
    'No caption generated for this item yet.';

  return (
    <section className="rounded-card bg-card shadow-border">
      <ReviewDetailPanelHeader item={item} statusLabel={statusLabel} />

      {/* Single column — lives in the agent Context rail, not a page split. */}
      <div className="grid gap-4 p-4">
        <div className="min-w-0 space-y-3">
          {/* Post-first: caption is primary. Media only when present. */}
          <InsetSurface className="p-4" tone="contrast">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="size-4 text-muted-foreground" />
              Caption
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
              {caption}
            </p>
            {item.status === BatchItemStatus.FAILED && item.error ? (
              <p className="mt-3 rounded-card border border-destructive/20 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                {item.error}
              </p>
            ) : null}
          </InsetSurface>

          {item.mediaUrl ? (
            <div className="relative aspect-[16/10] max-h-72 overflow-hidden rounded-card bg-background shadow-border">
              <Image
                src={item.mediaUrl}
                alt={item.caption ?? 'Review item preview'}
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 50vw"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-card bg-background px-3 py-2.5 text-xs text-muted-foreground shadow-border">
              <ImageIcon className="size-4 shrink-0" />
              No media on this draft yet
            </div>
          )}

          {item.prompt?.trim() && item.prompt.trim() !== caption ? (
            <InsetSurface className="p-4" tone="contrast">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Clock className="size-4 text-muted-foreground" />
                Prompt
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {item.prompt}
              </p>
            </InsetSurface>
          ) : null}
        </div>

        <ReviewDetailPanelAside
          key={item.id}
          browserTimezone={browserTimezone}
          formattedCreatedDate={formattedCreatedDate}
          formattedScheduledDate={formattedScheduledDate}
          isActioning={isActioning}
          isReady={isReady}
          isSelected={isSelected}
          item={item}
          onApprove={onApprove}
          onReject={onReject}
          onRequestChanges={onRequestChanges}
          onToggleSelect={onToggleSelect}
          reviewEvents={reviewEvents}
          statusLabel={statusLabel}
        />
      </div>
    </section>
  );
}
