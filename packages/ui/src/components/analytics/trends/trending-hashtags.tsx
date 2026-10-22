'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import type { TrendingHashtagsProps } from '@genfeedai/props/analytics/trends.props';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  PLATFORM_CONFIGS,
  PLATFORM_CONFIGS_ARRAY,
} from '@ui-constants/platform.constant';
import { Hash, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

const HASHTAG_PLATFORMS = ['tiktok', 'instagram', 'twitter'];

export function TrendingHashtags({
  hashtags,
  isLoading = false,
  selectedPlatform,
  onPlatformChange,
  onHashtagClick,
  className = '',
}: TrendingHashtagsProps) {
  const translate = useTranslations('ui.discovery');
  const filteredPlatforms = PLATFORM_CONFIGS_ARRAY.filter((p) =>
    HASHTAG_PLATFORMS.includes(p.id),
  );

  const filteredHashtags = selectedPlatform
    ? hashtags.filter((h) => h.platform === selectedPlatform)
    : hashtags;

  const sortedHashtags = filteredHashtags.toSorted(
    (a, b) => b.viralityScore - a.viralityScore,
  );

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Hash className="text-muted-foreground" />
            Trending Hashtags
          </h2>
          <p className="text-sm text-foreground/60">
            Observed hashtags and the videos behind them.
          </p>
        </div>

        {onPlatformChange && (
          <Select
            value={selectedPlatform || 'all'}
            onValueChange={(value) =>
              onPlatformChange(value === 'all' ? '' : value)
            }
          >
            <SelectTrigger
              aria-label={translate('hashtagPlatformFilter')}
              className="w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{translate('allPlatforms')}</SelectItem>
              {filteredPlatforms.map((platform) => (
                <SelectItem key={platform.id} value={platform.id}>
                  {platform.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <CollectionGrid
          data-testid="trending-hashtags-skeleton"
          density="tile"
          maxColumns={3}
        >
          {[1, 2, 3, 4, 5, 6].map((id) => (
            <div key={id} className="animate-pulse h-24 bg-muted" />
          ))}
        </CollectionGrid>
      ) : filteredHashtags.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          {translate('noScopedHashtags')}
        </p>
      ) : (
        <>
          <CollectionGrid
            data-testid="trending-hashtags-grid"
            density="tile"
            maxColumns={3}
          >
            {sortedHashtags.slice(0, 12).map((hashtag) => {
              const config = PLATFORM_CONFIGS[hashtag.platform];
              const Icon = config?.icon;

              return (
                <Card
                  key={hashtag.id}
                  variant={CardVariant.DEFAULT}
                  className={
                    onHashtagClick ? 'hover:shadow-border-strong' : undefined
                  }
                  bodyClassName="p-4"
                >
                  {onHashtagClick ? (
                    <Button
                      ariaLabel={`#${hashtag.hashtag}`}
                      className="absolute inset-0 z-10 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => onHashtagClick(hashtag)}
                      type="button"
                      variant={ButtonVariant.UNSTYLED}
                      withWrapper={false}
                    />
                  ) : null}
                  <div className="flex items-start justify-between mb-2">
                    <span
                      className="text-lg font-bold truncate"
                      style={{ color: config?.color }}
                    >
                      #{hashtag.hashtag}
                    </span>
                    {Icon && (
                      <Icon
                        className="size-4 flex-shrink-0 ml-2"
                        style={{ color: config?.color }}
                      />
                    )}
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-foreground/60">
                        {hashtag.postCountScope === 'observed'
                          ? translate('observedPosts')
                          : 'Posts'}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCompactNumber(hashtag.postCount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-foreground/60">Views</span>
                      <span className="font-medium tabular-nums">
                        {hashtag.viewsMeasured === false
                          ? translate('notMeasured')
                          : formatCompactNumber(hashtag.viewCount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-foreground/60 flex items-center gap-1">
                        <TrendingUp className="size-3.5" />
                        Growth
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${
                          hashtag.growthRate > 0
                            ? 'text-success'
                            : hashtag.growthRate < 0
                              ? 'text-destructive'
                              : ''
                        }`}
                      >
                        {hashtag.growthMeasured === false
                          ? translate('notMeasured')
                          : `${hashtag.growthRate > 0 ? '+' : ''}${hashtag.growthRate.toFixed(0)}%`}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-border">
                    <Badge
                      value={
                        hashtag.scoreMeasured === false
                          ? translate('notMeasured')
                          : `Score: ${Math.round(hashtag.viralityScore)}`
                      }
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
          </CollectionGrid>
          {sortedHashtags.length > 12 && (
            <p className="text-center text-sm text-foreground/60">
              Showing 12 of {sortedHashtags.length} hashtags
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default TrendingHashtags;
