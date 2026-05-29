'use client';

import { ComponentSize } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { isApproved } from './review-state';

type ReviewPanelItem = IBatchItem & {
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
};

interface ReviewDetailPanelHeaderProps {
  item: ReviewPanelItem;
  statusLabel: string;
}

export default function ReviewDetailPanelHeader({
  item,
  statusLabel,
}: ReviewDetailPanelHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-foreground/45">
          Review Workspace
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">
          {statusLabel}
        </h2>
        <p className="mt-1 text-sm text-foreground/55">
          Review the post preview, then make a clear keep, revise, or skip
          decision.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {item.platform && (
          <PlatformBadge platform={item.platform} size={ComponentSize.MD} />
        )}
        <Badge
          status={isApproved(item) ? 'completed' : item.status}
          size={ComponentSize.MD}
        >
          {statusLabel}
        </Badge>
        <Badge status={item.format} size={ComponentSize.MD} />
      </div>
    </div>
  );
}
