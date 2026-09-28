'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

export interface MasonryFailureNoticeProps {
  failureReason: string | null;
  ingredientId: string;
  /** Extra classes for the retry overlay. */
  overlayClassName?: string;
  /** Extra classes for the reason-only notice. */
  reasonClassName?: string;
  /** Owner-only: shows a retry button over the tile. */
  onRetry?: () => void;
}

/**
 * The notice on a failed asset. Its own component because it is the only part
 * of a tile that needs translations: a tile that has not failed calls no
 * `useTranslations`, so read-only galleries (public profiles) render without
 * an intl provider.
 */
export default function MasonryFailureNotice({
  failureReason,
  ingredientId,
  overlayClassName,
  reasonClassName,
  onRetry,
}: MasonryFailureNoticeProps): React.ReactElement {
  const translate = useTranslations('common.libraryRetry');
  const reason = failureReason ?? translate('genericFailureReason');

  if (onRetry) {
    return (
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/45 px-4 text-center backdrop-blur-sm' /* design-system-allow-content-color -- media overlay */,
          overlayClassName,
        )}
        data-testid={`asset-failure-overlay-${ingredientId}`}
      >
        <p
          className={
            'line-clamp-2 text-xs font-medium text-white' /* design-system-allow-content-color -- media overlay */
          }
        >
          {reason}
        </p>
        <div
          role="presentation"
          className="pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            onClick={onRetry}
            label={translate('retry')}
            ariaLabel={translate('retryAriaLabel')}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-secondary/90 px-3 py-2 text-center text-xs font-medium text-foreground/70 shadow-dropdown',
        reasonClassName,
      )}
      data-testid={`asset-failure-reason-${ingredientId}`}
      role="status"
    >
      <span className="line-clamp-2">{reason}</span>
    </div>
  );
}
