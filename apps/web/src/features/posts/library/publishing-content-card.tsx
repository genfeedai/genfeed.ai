'use client';

import { CardGap, CardPadding } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePublishingContentTime } from '@/features/posts/hooks/use-publishing-content-time/use-publishing-content-time';
import PublishingContentChannels from '@/features/posts/library/publishing-content-channels';
import {
  formatPublishingContentChannel,
  formatPublishingContentFormat,
} from '@/features/posts/library/publishing-content-library.helpers';
import PublishingContentMediaPreview from '@/features/posts/library/publishing-content-media-preview';
import PublishingContentStatus from '@/features/posts/library/publishing-content-status';
import type { PublishingContentCardProps } from '@/features/posts/props/publishing-content-entry.props';

/**
 * A post as a card: its media, the account it goes to, its text and when it
 * goes out. A text-only post shows its text larger in place of the media.
 * Clicking the card opens the drawer; the title opens the post.
 */
export default function PublishingContentCard({
  actions,
  isStatusShown,
  item,
  onOpen,
  titleHref,
}: PublishingContentCardProps) {
  const translate = useTranslations('pages.posts.list.collection');
  const time = usePublishingContentTime(
    item.publishedAt,
    item.scheduledAt,
    'medium',
  );
  const channels = item.channels ?? [item.channel];
  const accountLabel =
    item.accounts?.[0]?.label ?? formatPublishingContentChannel(item.channel);
  const hasMedia = Boolean(item.media);
  const summary =
    item.summary && item.summary !== item.title ? item.summary : '';

  return (
    // ui-guard-allow:clickable-element -- pointer shortcut for the whole card; the title link and the actions inside are the keyboard path
    <div
      className="cursor-pointer"
      onClick={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('a,button,[role="menu"]')
        ) {
          return;
        }
        onOpen(item);
      }}
    >
      <Card
        isInteractive
        className="overflow-hidden"
        gap={CardGap.NONE}
        padding={CardPadding.NONE}
      >
        {item.media ? (
          <PublishingContentMediaPreview media={item.media} />
        ) : null}
        <div className="flex flex-col gap-2 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <PublishingContentChannels
              accounts={item.accounts?.slice(0, 1)}
              channels={channels.slice(0, 1)}
            />
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {accountLabel}
            </span>
            {item.format ? (
              <Badge className="ml-auto shrink-0">
                {formatPublishingContentFormat(item.format)}
              </Badge>
            ) : null}
          </div>
          <Link
            href={titleHref}
            className={
              hasMedia
                ? 'line-clamp-2 text-sm font-medium text-foreground hover:underline'
                : 'line-clamp-5 text-base font-medium text-foreground hover:underline'
            }
          >
            {item.title}
          </Link>
          {summary ? (
            <p className="line-clamp-3 text-sm text-foreground/60">{summary}</p>
          ) : null}
          <div className="flex min-w-0 items-center justify-between gap-2 pt-1">
            {isStatusShown ? (
              <PublishingContentStatus
                publishedAt={item.publishedAt}
                scheduledAt={item.scheduledAt}
                status={item.status}
              />
            ) : time ? (
              <time
                className="min-w-0 truncate text-xs text-muted-foreground"
                dateTime={time.date.toISOString()}
              >
                {time.label}
              </time>
            ) : (
              <span className="text-xs text-muted-foreground">
                {translate('notScheduled')}
              </span>
            )}
            {actions}
          </div>
        </div>
      </Card>
    </div>
  );
}
