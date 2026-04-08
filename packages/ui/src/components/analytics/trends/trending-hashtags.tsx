'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/enums';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { TrendingHashtagsProps } from '@props/analytics/trends.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import {
  PLATFORM_CONFIGS,
  PLATFORM_CONFIGS_ARRAY,
} from '@ui-constants/platform.constant';
import { HiArrowTrendingUp, HiOutlineHashtag } from 'react-icons/hi2';

const HASHTAG_PLATFORMS = ['tiktok', 'instagram', 'twitter'];

export function TrendingHashtags({
  hashtags,
  isLoading = false,
  selectedPlatform,
  onPlatformChange,
  onHashtagClick,
  className = '',
}: TrendingHashtagsProps) {
  const filteredPlatforms = PLATFORM_CONFIGS_ARRAY.filter((p) =>
    HASHTAG_PLATFORMS.includes(p.id),
  );

  const filteredHashtags = selectedPlatform
    ? hashtags.filter((h) => h.platform === selectedPlatform)
    : hashtags;

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="animate-pulse h-6 bg-background w-40" />
          <div className="animate-pulse h-8 bg-background w-48" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="animate-pulse h-24 bg-background" />
          ))}
        </div>
      </div>
    );
  }

  if (filteredHashtags.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <HiOutlineHashtag className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-foreground/60">No trending hashtags found</p>
        <p className="text-sm text-foreground/40 mt-1">
          {selectedPlatform
            ? 'Try selecting a different platform'
            : 'Check back later for trending hashtags'}
        </p>
      </div>
    );
  }

  const sortedHashtags = [...filteredHashtags].sort(
    (a, b) => b.viralityScore - a.viralityScore,
  );

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <HiOutlineHashtag className="text-blue-500" />
            Trending Hashtags
          </h3>
          <p className="text-sm text-foreground/60">
            Most viral hashtags across platforms
          </p>
        </div>

        {onPlatformChange && (
          <div className="flex gap-1 bg-background/50 p-1 flex-wrap">
            <Button
              label="All"
              onClick={() => onPlatformChange('')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                !selectedPlatform
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
              variant={ButtonVariant.UNSTYLED}
            />
            {filteredPlatforms.map((platform) => {
              const Icon = platform.icon;
              return (
                <Button
                  key={platform.id}
                  label={platform.label}
                  icon={<Icon className="h-3.5 w-3.5" />}
                  onClick={() => onPlatformChange(platform.id)}
                  className={`px-3 py-1.5 text-sm transition-colors flex items-center gap-1.5 ${
                    selectedPlatform === platform.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                  variant={ButtonVariant.UNSTYLED}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {sortedHashtags.slice(0, 12).map((hashtag) => {
          const config = PLATFORM_CONFIGS[hashtag.platform];
          const Icon = config?.icon;

          return (
            <Card
              key={hashtag.id}
              variant={CardVariant.DEFAULT}
              onClick={
                onHashtagClick ? () => onHashtagClick(hashtag) : undefined
              }
              className="hover:border-primary/40 hover:shadow-md"
              bodyClassName="p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <span
                  className="text-lg font-bold truncate"
                  style={{ color: config?.color }}
                >
                  #{hashtag.hashtag}
                </span>
                {Icon && (
                  <Icon
                    className="h-4 w-4 flex-shrink-0 ml-2"
                    style={{ color: config?.color }}
                  />
                )}
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-foreground/60">Posts</span>
                  <span className="font-medium">
                    {formatCompactNumber(hashtag.postCount)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-foreground/60">Views</span>
                  <span className="font-medium">
                    {formatCompactNumber(hashtag.viewCount)}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-foreground/60 flex items-center gap-1">
                    <HiArrowTrendingUp className="h-3.5 w-3.5" />
                    Growth
                  </span>
                  <span
                    className={`font-semibold ${
                      hashtag.growthRate > 0
                        ? 'text-success'
                        : hashtag.growthRate < 0
                          ? 'text-error'
                          : ''
                    }`}
                  >
                    {hashtag.growthRate > 0 ? '+' : ''}
                    {hashtag.growthRate.toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-white/[0.08]">
                <Badge
                  value={`Score: ${Math.round(hashtag.viralityScore)}`}
                  className={`text-xs w-full justify-center ${
                    hashtag.viralityScore >= 70
                      ? 'bg-primary text-primary-foreground'
                      : hashtag.viralityScore >= 40
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-muted text-muted-foreground'
                  }`}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {sortedHashtags.length > 12 && (
        <p className="text-center text-sm text-foreground/60">
          Showing 12 of {sortedHashtags.length} hashtags
        </p>
      )}
    </div>
  );
}

export default TrendingHashtags;
