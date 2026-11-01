'use client';

import { CardGap, CardPadding, ComponentSize } from '@genfeedai/contracts';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Badge } from '@ui/primitives/badge';
import { DefinitionList } from '@ui/primitives/definition-list';
import { Copy, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { memo } from 'react';
import type { AnalyticsPostCardProps } from '@/features/analytics/props/analytics-posts-grid.props';
import { resolveCapturedAudience } from '@/features/posts/list/captured-post.helpers';

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
      className="flex size-full items-center justify-center bg-card text-muted-foreground"
      data-testid="analytics-post-media-fallback"
    >
      {getPlatformIcon(item.platform, 'size-10') ?? (
        <Copy className="size-10" />
      )}
    </div>
  );
}

function AnalyticsPostCard({
  item,
  hasAudience,
  onSelectPost,
}: AnalyticsPostCardProps) {
  const translate = useTranslations('pages.analytics.postCard');
  const translateTrack = useTranslations('pages.analytics.trackPost');
  const { href } = useOrgUrl();
  const translateSource = useTranslations('pages.analytics.sourceFilter');
  const translateAudience = useTranslations('pages.posts.list.captured');
  const audience = hasAudience
    ? resolveCapturedAudience(item.visibility)
    : null;
  const hasMedia = Boolean(item.thumbnailUrl || item.ingredientUrl);

  return (
    <Card
      padding={CardPadding.NONE}
      gap={CardGap.NONE}
      className="group h-full w-full overflow-hidden"
      data-testid="analytics-post-card"
      onClick={() => onSelectPost(item.postId)}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <AnalyticsPostMedia item={item} />

        <Badge
          className="absolute left-2 top-2"
          shape="pill"
          size="lg"
          value={`#${item.rank}`}
          variant="overlay"
        />

        {hasMedia ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-background/80 p-1.5 backdrop-blur">
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
          <p className="mt-1 flex items-center gap-2 truncate text-xs text-foreground/60">
            <PlatformBadge platform={item.platform} size={ComponentSize.SM} />
            {item.brandName}
          </p>
        </div>

        {item.source === 'extension' ? (
          <div>
            <Badge variant="secondary">{translateTrack('badge')}</Badge>
          </div>
        ) : null}
        {item.metricsStatus === 'pending' ||
        item.metricsStatus === 'unavailable' ? (
          <p className="text-sm text-muted-foreground">
            {translateTrack(
              item.metricsStatus === 'pending'
                ? 'pendingMetrics'
                : 'unavailableMetrics',
            )}
          </p>
        ) : (
          <div className="border-t border-border pt-3">
            <DefinitionList columns={3} variant="metrics">
              <MetricCard
                appearance="inset"
                label={translate('views')}
                size="xs"
                value={formatCompactNumber(item.totalViews)}
              />
              <MetricCard
                appearance="inset"
                label={translate('engagement')}
                size="xs"
                value={formatCompactNumber(item.totalEngagement)}
              />
              <MetricCard
                appearance="inset"
                label={translate('engagementRate')}
                size="xs"
                value={`${item.engagementRate.toFixed(2)}%`}
              />
            </DefinitionList>
          </div>
        )}

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
