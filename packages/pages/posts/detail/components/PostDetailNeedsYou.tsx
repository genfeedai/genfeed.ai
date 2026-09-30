'use client';

import {
  ButtonSize,
  ButtonVariant,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { isPostAwaitingReview } from '@helpers/content/post-review.helper';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

export interface PostDetailNeedsYouProps {
  post: IPost;
  isPublished: boolean;
  onPublishNow?: () => void;
  onReviewHref: string;
  className?: string;
}

interface NeedsYouItem {
  id: string;
  /** The specific condition, e.g. "This post failed to publish." */
  message: string;
  action: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

/**
 * The post's own open work: it failed to publish, it is waiting on review, or
 * its scheduled time has already passed. Reuses the post already loaded for
 * the page — no new query (#5483 non-goal: new data).
 */
export default function PostDetailNeedsYou({
  post,
  isPublished,
  onPublishNow,
  onReviewHref,
  className,
}: PostDetailNeedsYouProps) {
  const translate = useTranslations('pages.posts.detail.needsYou');
  const scheduledAt = post.scheduledDate
    ? new Date(post.scheduledDate).getTime()
    : Number.NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (
      isPublished ||
      post.targetExecutionState !== TargetExecutionState.SCHEDULED ||
      !Number.isFinite(scheduledAt)
    ) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (scheduledAt >= currentTime) {
        timer = setTimeout(
          refresh,
          Math.min(scheduledAt - currentTime + 1, 2_147_483_647),
        );
      }
    };
    refresh();
    return () => clearTimeout(timer);
  }, [isPublished, post.targetExecutionState, scheduledAt]);

  const items = useMemo<NeedsYouItem[]>(() => {
    const results: NeedsYouItem[] = [];

    if (post.status === PostStatus.FAILED && onPublishNow) {
      results.push({
        action: { label: translate('failedAction'), onClick: onPublishNow },
        id: 'failed',
        message: translate('failedDescription'),
      });
    }

    if (isPostAwaitingReview(post)) {
      results.push({
        action: { href: onReviewHref, label: translate('pendingReviewAction') },
        id: 'pending-review',
        message: translate('pendingReviewDescription'),
      });
    }

    const isOverdue =
      !isPublished &&
      post.targetExecutionState === TargetExecutionState.SCHEDULED &&
      Boolean(post.scheduledDate) &&
      scheduledAt < now;
    if (isOverdue && onPublishNow) {
      results.push({
        action: { label: translate('overdueAction'), onClick: onPublishNow },
        id: 'overdue',
        message: translate('overdueDescription'),
      });
    }

    return results;
  }, [
    isPublished,
    now,
    onPublishNow,
    onReviewHref,
    post,
    scheduledAt,
    translate,
  ]);

  return (
    <CollectionSection
      className={className}
      itemCount={items.length}
      title={translate('title')}
    >
      <CollectionList>
        {items.map((item) => (
          <ListRow
            key={item.id}
            title={item.message}
            trailing={
              item.action.href ? (
                <Button
                  asChild
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                >
                  <Link href={item.action.href}>{item.action.label}</Link>
                </Button>
              ) : (
                <Button
                  label={item.action.label}
                  onClick={item.action.onClick}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
              )
            }
          />
        ))}
      </CollectionList>
    </CollectionSection>
  );
}
