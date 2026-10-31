'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  Timeframe,
} from '@genfeedai/contracts';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import SocialMediaPlayer from '@/components/analytics/trends/social-media-player';
import type { TrendVideoGalleryProps } from '@/props/analytics/trends.props';

export default function TrendVideoGallery({
  videos,
  isLoading,
  timeframe,
  onTimeframeChange,
  onVideoClick,
  selectedHashtag,
  onClearHashtag,
}: TrendVideoGalleryProps) {
  const translate = useTranslations('ui.discovery');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {translate('content')}
            {selectedHashtag ? ` · #${selectedHashtag}` : ''}
          </h2>
          <p className="text-sm text-muted-foreground">
            {translate('contentDescription')}
          </p>
        </div>
        {onTimeframeChange ? (
          <div className="flex gap-1">
            {(
              [
                { label: translate('hours24'), value: Timeframe.H24 },
                { label: translate('hours72'), value: Timeframe.H72 },
                { label: translate('days7'), value: Timeframe.D7 },
              ] as const
            ).map((option) => (
              <Button
                key={option.value}
                size={ButtonSize.SM}
                variant={
                  timeframe === option.value
                    ? ButtonVariant.SECONDARY
                    : ButtonVariant.GHOST
                }
                onClick={() => onTimeframeChange?.(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {selectedHashtag ? (
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          onClick={onClearHashtag}
        >
          {translate('clearHashtag')}
        </Button>
      ) : null}
      {isLoading ? (
        <p role="status">{translate('loadingContent')}</p>
      ) : !videos.length ? (
        <p className="py-8 text-sm text-muted-foreground">
          {selectedHashtag
            ? translate('noHashtagContent')
            : translate('noContent')}
        </p>
      ) : (
        <CollectionGrid maxColumns={3}>
          {videos.slice(0, 12).map((video) => (
            <Card
              key={video.id || `${video.platform}:${video.externalId}`}
              bodyClassName="space-y-3 p-4"
            >
              <SocialMediaPlayer
                contentType="video"
                mediaUrl={video.playUrl || video.videoUrl}
                sourceUrl={video.videoUrl}
                thumbnailUrl={video.thumbnailUrl}
                title={video.title || video.hook || 'Trending video'}
              />
              <div className="space-y-1">
                <p className="line-clamp-2 text-sm font-medium">
                  {video.title || video.hook}
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <PlatformBadge
                    platform={video.platform}
                    size={ComponentSize.SM}
                  />
                  <span>@{video.creatorHandle}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCompactNumber(video.viewCount ?? video.views ?? 0)}{' '}
                  {translate('views')} ·{' '}
                  {formatCompactNumber(video.likeCount ?? video.likes ?? 0)}{' '}
                  {translate('likes')}
                </p>
              </div>
              {onVideoClick && video.id ? (
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => onVideoClick(video)}
                >
                  {translate('remix')}
                </Button>
              ) : null}
            </Card>
          ))}
        </CollectionGrid>
      )}
    </div>
  );
}
