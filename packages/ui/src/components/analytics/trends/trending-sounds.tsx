'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import { TiktokIcon } from '@genfeedai/helpers/ui/icons/brands';
import type { TrendingSoundsProps } from '@genfeedai/props/analytics/trends.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Music, Play, TrendingUp } from 'lucide-react';
import Image from 'next/image';

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
  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="animate-pulse h-6 bg-background w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((placeholderId) => (
            <div
              key={placeholderId}
              className="animate-pulse h-28 bg-background"
            />
          ))}
        </div>
      </div>
    );
  }

  if (sounds.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <Music className="size-12 mx-auto mb-3 opacity-30" />
        <p className="text-foreground/60">No trending sounds found</p>
        <p className="text-sm text-foreground/40 mt-1">
          Check back later for viral TikTok sounds
        </p>
      </div>
    );
  }

  const sortedSounds = sounds.toSorted((a, b) => b.usageCount - a.usageCount);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Music className="text-muted-foreground" />
          Trending Sounds
          <Badge className="text-xs bg-transparent">
            <TiktokIcon className="size-3 mr-1" />
            TikTok
          </Badge>
        </h3>
        <p className="text-sm text-foreground/60">
          Most popular sounds for content creation
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedSounds.slice(0, 9).map((sound, index) => (
          <Card
            key={sound.id}
            variant={CardVariant.DEFAULT}
            bodyClassName="p-4"
          >
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
                  <Button
                    withWrapper={false}
                    variant={ButtonVariant.UNSTYLED}
                    className="size-16 bg-muted flex items-center justify-center overflow-hidden"
                    onClick={(e) => {
                      if (onPlaySound) {
                        e.stopPropagation();
                        onPlaySound(sound);
                      }
                    }}
                    isDisabled={!onPlaySound}
                  >
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
                    {onPlaySound && (
                      <div
                        className={
                          'absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100' /* design-system-allow-content-color -- media overlay */
                        }
                      >
                        <Play
                          className={
                            'size-8 text-white' /* design-system-allow-content-color -- media overlay */
                          }
                        />
                      </div>
                    )}
                  </Button>
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
                      {formatCompactNumber(sound.usageCount)} uses
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
                  <TrendingUp
                    className={`size-4 ${
                      sound.growthRate > 0
                        ? 'text-success'
                        : 'text-foreground/40'
                    }`}
                  />
                  <span
                    className={`font-medium tabular-nums ${
                      sound.growthRate > 0
                        ? 'text-success'
                        : sound.growthRate < 0
                          ? 'text-error'
                          : ''
                    }`}
                  >
                    {sound.growthRate > 0 ? '+' : ''}
                    {sound.growthRate.toFixed(0)}%
                  </span>
                </div>
                <Badge
                  value={Math.round(sound.viralityScore)}
                  className={`text-xs ${
                    sound.viralityScore >= 70
                      ? 'bg-primary text-primary-foreground'
                      : sound.viralityScore >= 40
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-muted text-muted-foreground'
                  }`}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {sortedSounds.length > 9 && (
        <p className="text-center text-sm text-foreground/60">
          Showing 9 of {sortedSounds.length} sounds
        </p>
      )}
    </div>
  );
}

export default TrendingSounds;
