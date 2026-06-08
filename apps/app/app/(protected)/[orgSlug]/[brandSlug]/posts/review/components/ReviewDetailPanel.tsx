'use client';

import { BatchItemStatus } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { HiOutlineClock, HiPhoto, HiSparkles } from 'react-icons/hi2';
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
    case BatchItemStatus.GENERATING:
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
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setFeedback(item?.reviewFeedback ?? '');
  }, [item?.reviewFeedback]);

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

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <ReviewDetailPanelHeader item={item} statusLabel={statusLabel} />

      <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1.5fr),minmax(320px,1fr)]">
        <div className="space-y-5">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950">
            {item.mediaUrl ? (
              <Image
                src={item.mediaUrl}
                alt={item.caption ?? 'Review item preview'}
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 60vw"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-foreground/45">
                <div className="rounded-full border border-white/10 bg-white/[0.03] p-4">
                  <HiPhoto className="size-8" />
                </div>
                <p className="text-sm">No media preview generated yet</p>
              </div>
            )}
          </div>

          <InsetSurface className="p-5" tone="contrast">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <HiSparkles className="size-4 text-foreground/55" />
              Caption
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/85">
              {item.caption ?? 'No caption generated for this item yet.'}
            </p>
          </InsetSurface>

          <InsetSurface className="p-5" tone="contrast">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <HiOutlineClock className="size-4 text-foreground/55" />
              Prompt
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/70">
              {item.prompt ?? 'No generation prompt saved for this item.'}
            </p>
          </InsetSurface>
        </div>

        <ReviewDetailPanelAside
          browserTimezone={browserTimezone}
          feedback={feedback}
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
          setFeedback={setFeedback}
          statusLabel={statusLabel}
        />
      </div>
    </section>
  );
}
