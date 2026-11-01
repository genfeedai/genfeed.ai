'use client';
import { ButtonVariant, Timeframe } from '@genfeedai/contracts';
import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Table from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { Skeleton } from '@ui/primitives/skeleton';
import { Flame, Play } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ViralVideoLeaderboardProps } from '@/props/analytics/trends.props';

const TIMEFRAME_OPTIONS = [
  { label: '24 hours', value: Timeframe.H24 },
  { label: '72 hours', value: Timeframe.H72 },
  { label: '7 days', value: Timeframe.D7 },
] as const;

export function ViralVideoLeaderboard({
  videos,
  isLoading = false,
  timeframe = Timeframe.H72,
  onTimeframeChange,
  onVideoClick,
  className = '',
}: ViralVideoLeaderboardProps) {
  const translate = useTranslations('ui.analyticsTrends');
  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((placeholderId) => (
            <Skeleton key={placeholderId} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={Flame}
        title="No viral videos found"
        description="Check back later for trending content"
      />
    );
  }

  const platforms = new Set(videos.map((video) => video.platform));
  const canSortByRatio = platforms.size === 1;
  const sortedVideos = videos.toSorted((a, b) => {
    if (canSortByRatio) {
      return (b.outlierRatio ?? -1) - (a.outlierRatio ?? -1);
    }
    return b.viralScore - a.viralScore;
  });

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flame className="text-muted-foreground" />
            Viral Video Leaderboard
          </h2>
          <p className="text-sm text-foreground/60">
            Top performing videos from the last{' '}
            {TIMEFRAME_OPTIONS.find((t) => t.value === timeframe)?.label}
          </p>
        </div>

        {onTimeframeChange && (
          <div className="flex gap-1 bg-background/50 p-1">
            {TIMEFRAME_OPTIONS.map((option) => (
              <Button
                key={option.value}
                label={option.label}
                onClick={() => onTimeframeChange(option.value)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  timeframe === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
                variant={ButtonVariant.UNSTYLED}
              />
            ))}
          </div>
        )}
      </div>

      <Table<ITrendVideo>
        items={sortedVideos}
        getRowKey={(video) => video.id || video.externalId || ''}
        onRowClick={onVideoClick}
        columns={[
          {
            className: 'w-12',
            header: '#',
            key: 'rank',
            render: (video) => (
              <span className="font-bold text-foreground/70">
                {sortedVideos.findIndex((v) => v.id === video.id) + 1}
              </span>
            ),
          },
          {
            className: 'w-20',
            header: '',
            key: 'thumbnail',
            render: (video) => (
              <div className="relative w-16 h-10 overflow-hidden bg-background flex-shrink-0">
                {video.thumbnailUrl ? (
                  <Image
                    src={video.thumbnailUrl}
                    alt={video.title || 'Video thumbnail'}
                    fill
                    sizes="64px"
                    className="size-full object-cover outline-media"
                    unoptimized
                  />
                ) : (
                  <div className="size-full flex items-center justify-center">
                    <Play className="size-6 text-muted-foreground" />
                  </div>
                )}
              </div>
            ),
          },
          {
            className: 'min-w-48',
            header: 'Video',
            key: 'title',
            render: (video) => (
              <div className="flex flex-col gap-1 min-w-0">
                <span className="font-medium text-foreground truncate">
                  {video.title || video.hook || 'Untitled video'}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-xs text-foreground/60 truncate">
                    @{video.creatorHandle}
                  </span>
                  {video.publishedAt ? (
                    <TableDateCell hasTime={false} value={video.publishedAt} />
                  ) : null}
                </span>
              </div>
            ),
          },
          {
            className: 'min-w-28',
            header: 'Platform',
            key: 'platform',
            render: (video) => <PlatformBadge platform={video.platform} />,
          },
          {
            className: 'min-w-20',
            header: 'Views',
            key: 'views',
            render: (video) => (
              <span className="font-semibold tabular-nums">
                {formatCompactNumber(video.views || video.viewCount || 0)}
              </span>
            ),
          },
          {
            className: 'min-w-28',
            header: translate('median'),
            key: 'medianViews',
            render: (video) => (
              <span className="tabular-nums">
                {video.medianViews == null
                  ? '—'
                  : `${formatCompactNumber(video.medianViews)}${
                      video.sampleSize ? ` (${video.sampleSize})` : ''
                    }`}
              </span>
            ),
          },
          {
            className: 'min-w-20',
            header: translate('ratio'),
            key: 'outlierRatio',
            render: (video) => (
              <span className="font-semibold tabular-nums">
                {video.outlierRatio == null
                  ? '—'
                  : `${video.outlierRatio.toFixed(video.outlierRatio >= 10 ? 0 : 1)}x`}
              </span>
            ),
          },
          {
            className: 'min-w-24',
            header: (
              <AnalyticsMetricLabel metric="engagementRate">
                Engagement
              </AnalyticsMetricLabel>
            ),
            key: 'engagement',
            render: (video) => (
              <span className="font-medium tabular-nums">
                {video.engagementRate?.toFixed(1) || '0.0'}%
              </span>
            ),
          },
          {
            className: 'min-w-16',
            header: 'Score',
            key: 'viralScore',
            render: (video) => {
              const rank = sortedVideos.findIndex((v) => v.id === video.id) + 1;
              return (
                <Badge
                  isSolid={rank <= 3}
                  value={Math.round(video.viralScore)}
                  variant={rank <= 3 ? 'default' : 'secondary'}
                />
              );
            },
          },
        ]}
      />
    </div>
  );
}

export default ViralVideoLeaderboard;
