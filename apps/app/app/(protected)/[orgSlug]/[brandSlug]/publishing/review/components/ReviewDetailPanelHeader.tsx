'use client';

import { ComponentSize } from '@genfeedai/contracts';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { getReviewItemBadgeStatus } from './review-item.helpers';
import type { ReviewPanelItem } from './review-panel.types';

interface ReviewDetailPanelHeaderProps {
  item: ReviewPanelItem;
  statusLabel: string;
}

export default function ReviewDetailPanelHeader({
  item,
  statusLabel,
}: ReviewDetailPanelHeaderProps) {
  const title =
    item.caption?.trim() ||
    item.prompt?.trim() ||
    (item.postId ? 'Draft post' : 'Review item');

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Review
        </p>
        <h2 className="mt-1 line-clamp-2 text-base font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{statusLabel}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {item.platform ? (
          <PlatformBadge platform={item.platform} size={ComponentSize.SM} />
        ) : null}
        <Badge status={getReviewItemBadgeStatus(item)} size={ComponentSize.SM}>
          {statusLabel}
        </Badge>
        {item.format ? (
          <Badge status={item.format} size={ComponentSize.SM} />
        ) : null}
      </div>
    </div>
  );
}
