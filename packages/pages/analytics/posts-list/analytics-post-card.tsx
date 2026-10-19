'use client';

import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { resolveCapturedAudience } from '@pages/posts/list/captured-post.helpers';
import type { AnalyticsPostCardProps } from '@props/analytics/analytics-posts-grid.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Copy, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

const VIDEO_CONFIG = {
  controls: false,
  loop: true,
  muted: true,
  playsInline: true,
  preload: 'metadata',
} as const;

function AnalyticsPostMedia({ item }: Pick<AnalyticsPostCardProps, 'item'>) {
  const imageUrl =
    item.thumbnailUrl || (item.isVideo ? undefined : item.ingredientUrl);

  if (imageUrl) {
    return (
      <Image
        alt=""
        className="object-cover"
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 25vw"
        src={imageUrl}
        unoptimized
      />
    );
  }

  if (item.isVideo && item.ingredientUrl) {
    return (
      <VideoPlayer
        ariaLabel={item.label}
        config={VIDEO_CONFIG}
        mediaClassName="object-cover"
        src={item.ingredientUrl}
      />
    );
  }

  // No media on the row: the platform mark stands in for the thumbnail.
  return (
    <div
      className="flex size-full items-center justify-center bg-background-secondary text-muted-foreground"
      data-testid="analytics-post-media-fallback"
    >
      {getPlatformIcon(item.platform, 'size-10') ?? (
        <Copy className="size-10" />
      )}
    </div>
  );
}

function AnalyticsPostStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-2xs uppercase tracking-wide text-foreground/50">
        {label}
      </dt>
      <dd className="truncate font-mono text-sm font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function AnalyticsPostCard({
  item,
  hasAudience,
  onSelectPost,
}: AnalyticsPostCardProps) {
  const translate = useTranslations('pages.analytics.postCard');
  const { href } = useOrgUrl();
  const translateSource = useTranslations('pages.analytics.sourceFilter');
  const translateAudience = useTranslations('pages.posts.list.captured');
  const audience = hasAudience
    ? resolveCapturedAudience(item.visibility)
    : null;
  const hasMedia = Boolean(item.thumbnailUrl || item.ingredientUrl);

  return (
    <Card
      bodyClassName="gap-0 p-0"
      className="group h-full w-full overflow-hidden"
      data-testid="analytics-post-card"
      onClick={() => onSelectPost(item.postId)}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-secondary">
        <AnalyticsPostMedia item={item} />

        <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground backdrop-blur">
          #{item.rank}
        </span>

        {hasMedia ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-background/85 p-1.5 backdrop-blur">
            {item.isVideo ? (
              <Play aria-hidden="true" className="size-3 text-foreground" />
            ) : null}
            {getPlatformIcon(item.platform, 'size-3.5')}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="min-w-0 text-left">
          <h3 className="line-clamp-2 min-h-[2lh] text-sm font-semibold leading-snug">
            <Link
              className="hover:underline"
              href={href(getPublishingPostHref(item.postId))}
              onClick={(event) => event.stopPropagation()}
            >
              {item.label}
            </Link>
          </h3>
          <p className="mt-1 truncate text-xs text-foreground/60">
            {item.brandName} · {item.platform}
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-left">
          <AnalyticsPostStat
            label={translate('views')}
            value={formatCompactNumber(item.totalViews)}
          />
          <AnalyticsPostStat
            label={translate('engagement')}
            value={formatCompactNumber(item.totalEngagement)}
          />
          <AnalyticsPostStat
            label={translate('engagementRate')}
            value={`${item.engagementRate.toFixed(2)}%`}
          />
        </dl>

        {audience ? (
          <div className="flex items-center gap-2 text-left">
            <span className="text-2xs uppercase tracking-wide text-foreground/50">
              {translateSource('audience')}
            </span>
            <Badge
              variant={audience === 'unavailable' ? 'outline' : 'secondary'}
            >
              {translateAudience(`audience.${audience}`)}
            </Badge>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default memo(AnalyticsPostCard);
