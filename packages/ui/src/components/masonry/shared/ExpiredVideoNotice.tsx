'use client';

import { VIDEO_RETENTION_DAYS } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useTranslations } from 'next-intl';

export interface ExpiredVideoNoticeProps {
  ingredientId: string;
  className?: string;
}

/**
 * Shown in place of a video whose file the retention sweep deleted. Its own
 * component, like `MasonryFailureNotice`, so a tile whose video still exists
 * calls no `useTranslations` and read-only galleries render without an intl
 * provider.
 */
export default function ExpiredVideoNotice({
  ingredientId,
  className,
}: ExpiredVideoNoticeProps): React.ReactElement {
  const translate = useTranslations('common.videoRetention');

  return (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-muted/90 px-3 py-2 text-center text-xs text-foreground/70 shadow-dropdown',
        className,
      )}
      data-testid={`video-expired-${ingredientId}`}
      role="status"
    >
      <p className="font-medium text-foreground">{translate('title')}</p>
      <p className="line-clamp-3">
        {translate('description', {
          payg: VIDEO_RETENTION_DAYS.PAYG,
          subscriber: VIDEO_RETENTION_DAYS.SUBSCRIBER,
        })}
      </p>
    </div>
  );
}
