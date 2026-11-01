'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import type { TrendMediaExample } from '@genfeedai/contracts/interfaces';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import { getSafeExternalUrl } from '@genfeedai/helpers/media/social-media-source.helper';
import { TiktokIcon } from '@genfeedai/helpers/ui/icons/brands';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import { Music, Play, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import SocialMediaPlayer from '@/components/analytics/trends/social-media-player';
import type { TrendingSoundsProps } from '@/props/analytics/trends.props';

function formatDuration(seconds?: number): string {
  if (!seconds) {
    return '';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TrendingSounds({
  sounds,
  isLoading = false,
  onSoundClick,
  onPlaySound,
  className = '',
}: TrendingSoundsProps) {
  const translate = useTranslations('ui.discovery');
  const sortedSounds = sounds.toSorted((a, b) => b.usageCount - a.usageCount);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Music className="text-muted-foreground" />
          Trending Sounds
          <Badge icon={<TiktokIcon />} variant="outline">
            TikTok
          </Badge>
        </h2>
        <p className="text-sm text-foreground/60">
          {translate('soundDescription')}
        </p>
      </div>

      {isLoading ? (
        <CollectionGrid data-testid="trending-sounds-skeleton" maxColumns={3}>
          {[1, 2, 3, 4, 5, 6].map((id) => (
            <Skeleton key={id} className="h-24" />
          ))}
        </CollectionGrid>
      ) : sounds.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          {translate('noScopedSounds')}
        </p>
      ) : (
        <>
          <CollectionGrid data-testid="trending-sounds-grid" maxColumns={3}>
            {sortedSounds.slice(0, 9).map((sound, index) => (
              <Card key={sound.id} variant={CardVariant.DEFAULT}>
                <div className="relative">
                  {onSoundClick && (
                    <Button
                      aria-label={`Open ${sound.soundName}`}
                      className="absolute inset-0 z-0"
                      onClick={() => onSoundClick(sound)}
                      type="button"
                      variant={ButtonVariant.UNSTYLED}
                      withWrapper={false}
                    />
                  )}

                  <div className="relative z-10 flex gap-3 pointer-events-none">
                    {/* Cover Art / Play Button */}
                    <div className="relative flex-shrink-0 pointer-events-auto">
                      <div className="relative size-16 bg-muted flex items-center justify-center overflow-hidden">
                        {sound.coverUrl ? (
                          <Image
                            src={sound.coverUrl}
                            alt={sound.soundName}
                            fill
                            sizes="64px"
                            className="size-full object-cover outline-media"
                            unoptimized
                          />
                        ) : (
                          <Music className="size-8 text-muted-foreground" />
                        )}
                        {onPlaySound ? (
                          <Button
                            aria-label={`Play ${sound.soundName}`}
                            withWrapper={false}
                            variant={ButtonVariant.UNSTYLED}
                            className="absolute inset-0 flex items-center justify-center"
                            onClick={(event) => {
                              event.stopPropagation();
                              onPlaySound(sound);
                            }}
                          >
                            <Play className="size-8" />
                          </Button>
                        ) : null}
                      </div>
                      {index < 3 && (
                        <div className="absolute -top-2 -right-2 size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                          {index + 1}
                        </div>
                      )}
                    </div>

                    {/* Sound Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-foreground truncate">
                        {sound.soundName}
                      </h4>
                      {sound.authorName && (
                        <p className="text-sm text-foreground/60 truncate">
                          {sound.authorName}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-foreground/60">
                        <span className="flex items-center gap-1 tabular-nums">
                          <Play className="size-3.5" />
                          {formatCompactNumber(sound.usageCount)}{' '}
                          {sound.usageCountScope === 'observed'
                            ? translate('observedVideos')
                            : translate('uses')}
                        </span>
                        {sound.duration && (
                          <span className="tabular-nums">
                            {formatDuration(sound.duration)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="relative z-10 flex items-center justify-between mt-3 pt-3 border-t border-border pointer-events-none">
                    <div className="flex items-center gap-1 text-sm">
                      {sound.usageCountScope === 'observed' ? (
                        <span>{translate('growthMissing')}</span>
                      ) : (
                        <>
                          <TrendingUp
                            className={`size-4 ${
                              sound.growthRate > 0
                                ? 'text-success'
                                : 'text-muted-foreground'
                            }`}
                          />
                          <span
                            className={`font-medium tabular-nums ${
                              sound.growthRate > 0
                                ? 'text-success'
                                : sound.growthRate < 0
                                  ? 'text-destructive'
                                  : ''
                            }`}
                          >
                            {sound.growthRate > 0 ? '+' : ''}
                            {sound.growthRate.toFixed(0)}%
                          </span>
                        </>
                      )}
                    </div>
                    <Badge
                      value={
                        sound.scoreMeasured === false
                          ? translate('notMeasured')
                          : Math.round(sound.viralityScore)
                      }
                      isSolid={sound.viralityScore >= 70}
                      size="lg"
                      variant={
                        sound.viralityScore >= 70 ? 'default' : 'secondary'
                      }
                    />
                  </div>
                </div>
                <AudioPreviewPlayer
                  audioUrl={getSafeExternalUrl(sound.playUrl) ?? undefined}
                  label={sound.soundName}
                  stopOnUnmount
                  isTimelineVisible
                />
                {sound.examples?.length ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {translate('soundExamples')}
                    </p>
                    {sound.examples.map((video: TrendMediaExample) => (
                      <SocialMediaPlayer
                        key={`${video.platform}:${video.externalId}`}
                        contentType="video"
                        mediaUrl={video.videoUrl}
                        sourceUrl={video.videoUrl}
                        thumbnailUrl={video.thumbnailUrl}
                        title={video.title || sound.soundName}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {translate('noSoundExamples')}
                  </p>
                )}
              </Card>
            ))}
          </CollectionGrid>
          {sortedSounds.length > 9 && (
            <p className="text-center text-sm text-foreground/60">
              Showing 9 of {sortedSounds.length} sounds
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default TrendingSounds;
