'use client';

import type { ITrendVideo } from '@genfeedai/interfaces';
import type { ICreatorWatchlist } from '@genfeedai/interfaces/analytics/creator-watchlist.interface';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

type PlatformConfigEntry = {
  icon?: React.ComponentType<{ className?: string }>;
  label?: string;
};

type Props = {
  viralLeaderboard: ITrendVideo[];
  creatorLeaderboard: ICreatorWatchlist[];
  platformConfigLookup: Record<string, PlatformConfigEntry>;
};

export default function CrossPlatformLeaderboardSection({
  viralLeaderboard,
  creatorLeaderboard,
  platformConfigLookup,
}: Props) {
  if (viralLeaderboard.length === 0 && creatorLeaderboard.length === 0) {
    return null;
  }

  return (
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      {viralLeaderboard.length > 0 && (
        <Card className="xl:col-span-2 backdrop-blur" bodyClassName="space-y-6">
          <VStack gap={2}>
            <Heading size="xl">Cross-Platform Leaderboard</Heading>
            <Text as="p" size="sm" color="subtle-60">
              Top viral content across all platforms in the last 72 hours.
            </Text>
          </VStack>
          <Table<ITrendVideo>
            items={viralLeaderboard}
            columns={[
              {
                className: 'w-10',
                header: '#',
                key: 'rank',
                render: (video) => (
                  <span className="font-semibold text-foreground/70">
                    {viralLeaderboard.findIndex(
                      (entry: ITrendVideo) => entry.id === video.id,
                    ) + 1}
                  </span>
                ),
              },
              {
                className: 'min-w-56',
                header: 'Video',
                key: 'title',
                render: (video) => (
                  <div className="flex flex-col gap-2">
                    <span className="font-semibold text-foreground">
                      {video.title || video.hook || 'Untitled'}
                    </span>
                    <span className="text-xs text-foreground/60">
                      @{video.creatorHandle}
                      {video.publishedAt &&
                        ` - ${formatDate(video.publishedAt)}`}
                    </span>
                  </div>
                ),
              },
              {
                className: 'min-w-40',
                header: 'Platform',
                key: 'platform',
                render: (video) => {
                  const platform = platformConfigLookup[video.platform];
                  const Icon = platform?.icon;

                  return (
                    <div className="flex items-center gap-2">
                      {Icon && (
                        <span className="text-lg text-foreground/70">
                          <Icon />
                        </span>
                      )}
                      <span className="font-medium text-foreground">
                        {platform?.label ?? video.platform}
                      </span>
                    </div>
                  );
                },
              },
              {
                className: 'min-w-24',
                header: 'Views',
                key: 'views',
                render: (video) => (
                  <span className="font-semibold text-foreground">
                    {formatCompactNumber(video.views || video.viewCount || 0)}
                  </span>
                ),
              },
              {
                className: 'min-w-32',
                header: 'Engagement',
                key: 'engagementRate',
                render: (video) => (
                  <span className="font-semibold text-foreground">
                    {(video.engagementRate || 0).toFixed(1)}%
                  </span>
                ),
              },
              {
                className: 'min-w-20 text-right',
                header: 'Score',
                key: 'viralScore',
                render: (video) => {
                  const rank =
                    viralLeaderboard.findIndex(
                      (entry: ITrendVideo) => entry.id === video.id,
                    ) + 1;

                  const badgeTone =
                    rank <= 3
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground';

                  return (
                    <Badge
                      value={Math.round(video.viralScore || 0)}
                      className={`${badgeTone} text-xs`}
                    />
                  );
                },
              },
            ]}
            getRowKey={(video) => video.id || video.externalId || ''}
          />
        </Card>
      )}

      {creatorLeaderboard.length > 0 && (
        <Card className="backdrop-blur" bodyClassName="space-y-6">
          <VStack gap={2}>
            <Heading size="xl">Creator watchlist</Heading>
            <Text as="p" size="sm" color="subtle-60">
              Fastest-growing creators to follow and benchmark this week.
            </Text>
          </VStack>
          <ul className="space-y-4">
            {creatorLeaderboard.map((brand: ICreatorWatchlist) => {
              const platform = platformConfigLookup[brand.platform];
              const Icon = platform?.icon;

              return (
                <li
                  key={brand.id}
                  className="flex items-start justify-between gap-4 border-b border-border pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-start gap-3">
                    {Icon && (
                      <span className="mt-1 flex size-8 items-center justify-center rounded-full bg-tertiary text-base text-foreground/70">
                        <Icon />
                      </span>
                    )}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {brand.handle}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs text-[10px] uppercase tracking-wide"
                        >
                          +{brand.growthRate}% 30d
                        </Badge>
                      </div>
                      <p className="text-xs text-foreground/60">
                        {brand.displayName} • {brand.contentPillar}
                      </p>
                      <p className="text-[11px] text-foreground/60">
                        Posting cadence: {brand.postingCadence}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-foreground/60">
                    <p className="font-semibold text-foreground">
                      {formatCompactNumber(brand.followers)} followers
                    </p>
                    <p className="font-semibold text-foreground">
                      {formatCompactNumber(brand.avgViews)} avg views
                    </p>
                    <p className="font-semibold text-foreground">
                      {brand.avgEngagementRate.toFixed(1)}% ER
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
