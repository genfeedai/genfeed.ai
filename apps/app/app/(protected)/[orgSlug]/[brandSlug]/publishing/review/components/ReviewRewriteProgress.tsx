import {
  BatchRewriteJobStatus,
  ButtonSize,
  ButtonVariant,
  CardVariant,
} from '@genfeedai/contracts';
import type { ReviewRewriteProgressProps } from '@props/publishing/review-rewrite-progress.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { Sparkles, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * In-page progress for a background batch rewrite. The rest of the Review page
 * stays usable while it runs; rows refresh as their captions land.
 */
export default function ReviewRewriteProgress({
  isCancelling,
  job,
  onCancel,
}: ReviewRewriteProgressProps) {
  const translate = useTranslations('common.batchRewrite');
  const total = job.itemIds.length;
  const handled = job.completedItemIds.length + job.failedItems.length;
  const isQueued = job.status === BatchRewriteJobStatus.QUEUED;

  return (
    <Card
      bodyClassName="flex flex-col gap-2 !p-3"
      className="bg-background-secondary"
      variant={CardVariant.DEFAULT}
    >
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <p
          aria-live="polite"
          className="flex items-center gap-1.5 text-xs text-foreground/70"
          role="status"
        >
          <Sparkles className="size-3.5" />
          {isCancelling
            ? translate('cancelling')
            : isQueued
              ? translate('queued')
              : translate('progressCount', { handled, total })}
        </p>
        <Button
          className="h-7 gap-1 px-2 text-xs"
          isDisabled={isCancelling}
          onClick={onCancel}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          <Square className="size-3.5" />
          {translate('cancel')}
        </Button>
      </div>
      <Progress
        aria-label={translate('progressCount', { handled, total })}
        value={total ? Math.round((handled / total) * 100) : 0}
      />
    </Card>
  );
}
