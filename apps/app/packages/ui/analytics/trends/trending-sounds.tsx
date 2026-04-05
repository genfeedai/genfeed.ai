'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/enums';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { TrendingSoundsProps } from '@props/analytics/trends.props';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { FaTiktok } from 'react-icons/fa6';
import {
  HiArrowTrendingUp,
  HiOutlineMusicalNote,
  HiOutlinePlay,
} from 'react-icons/hi2';

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
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse h-28 bg-background" />
          ))}
        </div>
      </div>
    );
  }

  if (sounds.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <HiOutlineMusicalNote className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-foreground/60">No trending sounds found</p>
        <p className="text-sm text-foreground/40 mt-1">
          Check back later for viral TikTok sounds
        </p>
      </div>
    );
  }

  const sortedSounds = [...sounds].sort((a, b) => b.usageCount - a.usageCount);

  const formatDuration = (seconds?: number) => {
    if (!seconds) {
      return '';
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <HiOutlineMusicalNote className="text-pink-500" />
          Trending Sounds
          <Badge className="text-xs bg-transparent">
            <FaTiktok className="h-3 w-3 mr-1" />
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
            onClick={onSoundClick ? () => onSoundClick(sound) : undefined}
            className="hover:border-primary/40 hover:shadow-md"
            bodyClassName="p-4"
          >
            <div className="flex gap-3">
              {/* Cover Art / Play Button */}
              <div className="relative flex-shrink-0">
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  className="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center overflow-hidden"
                  onClick={(e) => {
                    if (onPlaySound) {
                      e.stopPropagation();
                      onPlaySound(sound);
                    }
                  }}
                  isDisabled={!onPlaySound}
                >
                  {sound.coverUrl ? (
                    <img
                      src={sound.coverUrl}
                      alt={sound.soundName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <HiOutlineMusicalNote className="h-8 w-8 text-white" />
                  )}
                  {onPlaySound && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <HiOutlinePlay className="h-8 w-8 text-white" />
                    </div>
                  )}
                </Button>
                {index < 3 && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
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
                  <span className="flex items-center gap-1">
                    <HiOutlinePlay className="h-3.5 w-3.5" />
                    {formatCompactNumber(sound.usageCount)} uses
                  </span>
                  {sound.duration && (
                    <span>{formatDuration(sound.duration)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.08]">
              <div className="flex items-center gap-1 text-sm">
                <HiArrowTrendingUp
                  className={`h-4 w-4 ${
                    sound.growthRate > 0 ? 'text-success' : 'text-foreground/40'
                  }`}
                />
                <span
                  className={`font-medium ${
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
