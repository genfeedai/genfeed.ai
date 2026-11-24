'use client';

import type { TargetExecutionState } from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import {
  badgeVariantForTone,
  targetStateBadge,
} from '@/features/posts/shared/release-status.helpers';

interface ReleaseTargetStateBadgeProps {
  className?: string;
  executionState: TargetExecutionState;
  /** The target reads `published` but is a TikTok Inbox receipt, not a live post. */
  isInboxDelivery?: boolean;
}

/**
 * Where one channel target stands. A TikTok Inbox receipt is stored as
 * `published`, so it reads as delivered to the Inbox, never as Published.
 */
export default function ReleaseTargetStateBadge({
  className,
  executionState,
  isInboxDelivery = false,
}: ReleaseTargetStateBadgeProps) {
  const translate = useTranslations('ui.postDetailInspector');

  if (isInboxDelivery) {
    return (
      <Badge className={className} variant="info">
        {translate('tiktokInboxDelivered')}
      </Badge>
    );
  }

  const badge = targetStateBadge(executionState);
  return (
    <Badge className={className} variant={badgeVariantForTone(badge.tone)}>
      {badge.label}
    </Badge>
  );
}
