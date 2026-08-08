'use client';

import { BatchItemStatus } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import { DATE_FORMATS } from '@helpers/formatting/date/date.helper';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import { ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { useMemo } from 'react';

import ReviewDetailPanelAside from './ReviewDetailPanelAside';
import ReviewDetailPanelEmpty from './ReviewDetailPanelEmpty';
import ReviewDetailPanelHeader from './ReviewDetailPanelHeader';
import { formatReviewItemStatus } from './review-item.helpers';
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
  // Single source of truth with the table badge label.
  return formatReviewItemStatus(item);
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
        DATE_FORMATS.DISPLAY_DATETIME,
      )
    : null;
  const formattedCreatedDate = formatDateInTimezone(
    item.createdAt,
    browserTimezone,
    DATE_FORMATS.DISPLAY_DATETIME,
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
    // Flat inspector surface — no outer card wrapping nested cards.
    <section className="flex min-h-0 flex-col">
      <ReviewDetailPanelHeader item={item} statusLabel={statusLabel} />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-3 border-b border-border px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Caption
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
            {caption}
          </p>
          {item.status === BatchItemStatus.FAILED && item.error ? (
            <p className="text-xs leading-5 text-destructive">{item.error}</p>
          ) : null}

          {item.mediaUrl ? (
            <div className="relative mt-1 aspect-[16/10] max-h-56 overflow-hidden rounded-md bg-background-secondary">
              <Image
                src={item.mediaUrl}
                alt={item.caption ?? 'Review item preview'}
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 24rem"
              />
            </div>
          ) : (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="size-3.5 shrink-0" />
              No media on this draft yet
            </p>
          )}

          {item.prompt?.trim() && item.prompt.trim() !== caption ? (
            <div className="pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Prompt
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {item.prompt}
              </p>
            </div>
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
