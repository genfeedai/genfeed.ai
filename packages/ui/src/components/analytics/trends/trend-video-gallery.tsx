'use client';

import { ButtonSize, ButtonVariant, Timeframe } from '@genfeedai/contracts';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import type { TrendVideoGalleryProps } from '@genfeedai/props/analytics/trends.props';
import SocialMediaPlayer from '@ui/analytics/trends/social-media-player';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import { Button } from '@ui/primitives/button';

export default function TrendVideoGallery({
  videos,
  isLoading,
  timeframe,
  onTimeframeChange,
  onVideoClick,
  selectedHashtag,
  onClearHashtag,
}: TrendVideoGalleryProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Trending content{selectedHashtag ? ` · #${selectedHashtag}` : ''}
          </h2>
          <p className="text-sm text-muted-foreground">
            Observed videos from the selected publication window.
          </p>
        </div>
        <div className="flex gap-1">
          {(
            [
              { label: '24 hours', value: Timeframe.H24 },
              { label: '72 hours', value: Timeframe.H72 },
              { label: '7 days', value: Timeframe.D7 },
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
      </div>
      {selectedHashtag ? (
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          onClick={onClearHashtag}
        >
          Clear hashtag filter
        </Button>
      ) : null}
      {isLoading ? (
        <p role="status">Loading content…</p>
      ) : !videos.length ? (
        <p className="py-8 text-sm text-muted-foreground">
          {selectedHashtag
            ? 'No observed videos match this hashtag in the selected window.'
            : 'No observed videos in this window. Try 7 days or check source health.'}
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
                <p className="text-xs text-muted-foreground">
                  {video.platform} · @{video.creatorHandle}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCompactNumber(video.viewCount ?? video.views ?? 0)}{' '}
                  views ·{' '}
                  {formatCompactNumber(video.likeCount ?? video.likes ?? 0)}{' '}
                  likes
                </p>
              </div>
              {onVideoClick && video.id ? (
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => onVideoClick(video)}
                >
                  Remix
                </Button>
              ) : null}
            </Card>
          ))}
        </CollectionGrid>
      )}
    </div>
  );
}
