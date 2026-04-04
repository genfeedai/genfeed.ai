'use client';

import type { ITrendVideo } from '@genfeedai/interfaces';
import { ButtonVariant, Timeframe } from '@genfeedai/enums';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { ViralVideoLeaderboardProps } from '@props/analytics/trends.props';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { HiOutlineFire, HiOutlinePlay } from 'react-icons/hi2';

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
  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="animate-pulse h-6 bg-background w-48" />
          <div className="animate-pulse h-8 bg-background w-32" />
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-background" />
          ))}
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <HiOutlineFire className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-foreground/60">No viral videos found</p>
        <p className="text-sm text-foreground/40 mt-1">
          Check back later for trending content
        </p>
      </div>
    );
  }

  const sortedVideos = [...videos].sort((a, b) => b.viralScore - a.viralScore);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <HiOutlineFire className="text-orange-500" />
            Viral Video Leaderboard
          </h3>
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
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title || 'Video thumbnail'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <HiOutlinePlay className="w-6 h-6 text-foreground/30" />
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
                <span className="text-xs text-foreground/60 truncate">
                  @{video.creatorHandle}
                  {video.publishedAt && ` - ${formatDate(video.publishedAt)}`}
                </span>
              </div>
            ),
          },
          {
            className: 'min-w-28',
            header: 'Platform',
            key: 'platform',
            render: (video) => {
              const config = PLATFORM_CONFIGS[video.platform];
              const Icon = config?.icon;
              return (
                <div className="flex items-center gap-2">
                  {Icon && (
                    <Icon
                      className="h-4 w-4"
                      style={{ color: config?.color }}
                    />
                  )}
                  <span className="font-medium text-sm">
                    {config?.label || video.platform}
                  </span>
                </div>
              );
            },
          },
          {
            className: 'min-w-20',
            header: 'Views',
            key: 'views',
            render: (video) => (
              <span className="font-semibold">
                {formatCompactNumber(video.views || video.viewCount || 0)}
              </span>
            ),
          },
          {
            className: 'min-w-24',
            header: 'Engagement',
            key: 'engagement',
            render: (video) => (
              <span className="font-medium">
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
              const badgeClass =
                rank <= 3
                  ? 'bg-primary text-primary-foreground'
                  : rank <= 10
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-muted text-muted-foreground';
              return (
                <Badge
                  value={Math.round(video.viralScore)}
                  className={`${badgeClass} text-xs`}
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
