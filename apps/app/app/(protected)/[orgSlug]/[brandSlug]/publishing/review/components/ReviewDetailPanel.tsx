import { TurboRunItemStatus } from '@genfeedai/contracts';
import { DATE_FORMATS } from '@helpers/formatting/date/date.helper';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import type { ReviewPanelItem } from '@props/publishing/review-panel-item.props';
import TargetPreview from '@ui/previews/TargetPreview';
import { ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { ReviewDetailPanelProps } from '@/features/posts/props/review-detail-panel.props';

import ReviewDetailPanelAside from './ReviewDetailPanelAside';
import ReviewDetailPanelEmpty from './ReviewDetailPanelEmpty';
import ReviewDetailPanelHeader from './ReviewDetailPanelHeader';
import {
  buildReviewItemTargetPreview,
  formatReviewItemStatus,
} from './review-item.helpers';
import { isReadyToReview } from './review-state';

function buildStatusLabel(
  item: ReviewPanelItem,
  translate: ReturnType<typeof useTranslations>,
): string {
  // Single source of truth with the table badge label.
  return formatReviewItemStatus(item, translate);
}

export default function ReviewDetailPanel({
  isActioning,
  isSelected,
  item,
  onApprove,
  onAssign,
  onRequestChanges,
  onReject,
  onToggleSelect,
  onUnassign,
}: ReviewDetailPanelProps) {
  const translate = useTranslations('pages.publishing.review');
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
  const statusLabel = buildStatusLabel(item, translate);
  const reviewEvents = (item.reviewEvents ?? []).toSorted((left, right) =>
    right.reviewedAt.localeCompare(left.reviewedAt),
  );
  const caption =
    item.caption?.trim() ||
    item.prompt?.trim() ||
    translate('detail.noCaption');
  const targetPreview = buildReviewItemTargetPreview(item, translate);

  return (
    // Flat inspector surface — no outer card wrapping nested cards.
    <section className="flex min-h-0 flex-col">
      <ReviewDetailPanelHeader item={item} statusLabel={statusLabel} />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-3 border-b border-border px-4 py-4">
          <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {translate('detail.preview')}
          </p>
          {targetPreview ? <TargetPreview {...targetPreview} /> : null}
          {item.status === TurboRunItemStatus.FAILED && item.error ? (
            <p className="text-xs leading-5 text-destructive">{item.error}</p>
          ) : null}

          {!item.mediaUrl ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="size-3.5 shrink-0" />
              {translate('detail.noMedia')}
            </p>
          ) : null}

          {item.prompt?.trim() && item.prompt.trim() !== caption ? (
            <div className="pt-2">
              <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {translate('detail.prompt')}
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
          onAssign={onAssign}
          onReject={onReject}
          onRequestChanges={onRequestChanges}
          onToggleSelect={onToggleSelect}
          onUnassign={onUnassign}
          reviewEvents={reviewEvents}
          statusLabel={statusLabel}
        />
      </div>
    </section>
  );
}
