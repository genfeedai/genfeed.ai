'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
  CardVariant,
  ComponentSize,
} from '@genfeedai/contracts';
import type { IScheduledReleaseBatchPost } from '@genfeedai/contracts/interfaces';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { Undo2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  formatBatchPostTime,
  toBatchPreviewTarget,
} from '../scheduled-release-batch.helpers';

interface ScheduledReleaseBatchPostRowProps {
  post: IScheduledReleaseBatchPost;
  /** The reviewer took this post out; it is shown struck back, not previewed. */
  isRemoved: boolean;
  /** The decision is made: no more removing or putting back. */
  isLocked: boolean;
  onToggle: () => void;
}

/**
 * One post in full: time, channel, account, text and its media in slide order,
 * through the shared platform preview, so what is read is what publishes.
 */
export default function ScheduledReleaseBatchPostRow({
  post,
  isRemoved,
  isLocked,
  onToggle,
}: ScheduledReleaseBatchPostRowProps) {
  const translate = useTranslations('pages.publishing.batch');
  const locale = useLocale();
  const time = formatBatchPostTime(post, locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const when = formatBatchPostTime(post, locale, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  });

  return (
    <li>
      <Card
        gap={CardGap.SM}
        isDisabled={isRemoved}
        padding={CardPadding.SM}
        variant={CardVariant.BORDERED}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium tabular-nums text-foreground">
              {time || translate('unscheduled')}
            </span>
            <PlatformBadge
              platform={post.platform}
              showLabel
              size={ComponentSize.SM}
              variant="solid"
            />
            {post.accountLabel || post.accountHandle ? (
              <span className="text-xs text-muted-foreground">
                {post.accountLabel ?? `@${post.accountHandle}`}
              </span>
            ) : null}
            {post.media.length > 1 ? (
              <Badge variant="outline">
                {translate('slides', { count: post.media.length })}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {post.releaseId ? (
              <>
                <span className="font-mono text-xs text-muted-foreground">
                  {post.releaseId}
                </span>
                <Badge status="scheduled">{translate('rowScheduled')}</Badge>
              </>
            ) : null}
            {post.error ? (
              <Badge status="failed">{translate('rowFailed')}</Badge>
            ) : null}
            {isRemoved ? (
              <Badge variant="secondary">{translate('rowRemoved')}</Badge>
            ) : null}
            {isLocked ? null : (
              <Button
                ariaLabel={translate(
                  isRemoved ? 'putBackLabel' : 'removeLabel',
                  { when },
                )}
                icon={
                  isRemoved ? (
                    <Undo2 aria-hidden="true" />
                  ) : (
                    <X aria-hidden="true" />
                  )
                }
                onClick={onToggle}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              >
                {translate(isRemoved ? 'putBack' : 'remove')}
              </Button>
            )}
          </div>
        </div>
        {post.error ? (
          <Text as="p" className="text-destructive" size="sm">
            {post.error}
          </Text>
        ) : null}
        {isRemoved ? null : (
          <PlatformPreview
            className="min-w-0"
            headerPresentation="account"
            showValidation={false}
            target={toBatchPreviewTarget(post)}
          />
        )}
      </Card>
    </li>
  );
}
