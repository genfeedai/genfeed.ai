'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { TrendItem } from '@props/trends/trends-page.props';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import { HiOutlineFire } from 'react-icons/hi2';

type PlatformConfigEntry = {
  icon?: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  label?: string;
  color?: string;
};

type Props = {
  isLoadingTrends: boolean;
  trendingTopics: TrendItem[];
  platformConfigLookup: Record<string, PlatformConfigEntry>;
  onRowClick: (item: TrendItem) => void;
};

function getGrowthRateClass(rate: number): string {
  if (rate > 0) {
    return 'text-success';
  }
  if (rate < 0) {
    return 'text-error';
  }
  return '';
}

function getViralityBadgeClass(score: number): string {
  if (score >= 70) {
    return 'bg-primary text-primary-foreground';
  }
  if (score >= 40) {
    return 'bg-secondary text-secondary-foreground';
  }
  return 'bg-muted text-muted-foreground';
}

export default function TrendingTopicsSection({
  isLoadingTrends,
  trendingTopics,
  platformConfigLookup,
  onRowClick,
}: Props) {
  return (
    <>
      <p className="text-sm text-foreground/60">
        Click on a trend to see detailed analytics and cross-platform data.
      </p>
      {isLoadingTrends ? (
        <div className="animate-pulse space-y-3">
          {[
            'trend-skeleton-1',
            'trend-skeleton-2',
            'trend-skeleton-3',
            'trend-skeleton-4',
            'trend-skeleton-5',
          ].map((skeletonId) => (
            <div key={skeletonId} className="h-12 bg-background" />
          ))}
        </div>
      ) : trendingTopics.length === 0 ? (
        <div className="text-center py-8 text-foreground/60">
          <HiOutlineFire className="size-12 mx-auto mb-3 opacity-30" />
          <p>No trending topics available.</p>
          <p className="text-sm mt-1">
            Connect your social accounts to see personalized trends.
          </p>
        </div>
      ) : (
        <Table<TrendItem>
          items={trendingTopics.slice(0, 20)}
          getRowKey={(item) => item.id}
          onRowClick={onRowClick}
          columns={[
            {
              className: 'min-w-32',
              header: 'Platform',
              key: 'platform',
              render: (item) => {
                const config = platformConfigLookup[item.platform];
                const Icon = config?.icon;
                return (
                  <div className="flex items-center gap-2">
                    {Icon && (
                      <Icon
                        className="size-4"
                        style={{ color: config?.color }}
                      />
                    )}
                    <span className="font-medium">
                      {config?.label || item.platform}
                    </span>
                  </div>
                );
              },
            },
            {
              className: 'min-w-48',
              header: 'Topic',
              key: 'topic',
              render: (item) => (
                <span className="font-semibold text-foreground">
                  {item.topic}
                </span>
              ),
            },
            {
              className: 'min-w-24',
              header: 'Mentions',
              key: 'mentions',
              render: (item) => (
                <span className="font-medium">
                  {formatCompactNumber(item.mentions)}
                </span>
              ),
            },
            {
              className: 'min-w-20',
              header: 'Growth',
              key: 'growthRate',
              render: (item) => (
                <span
                  className={`font-medium ${getGrowthRateClass(item.growthRate)}`}
                >
                  {item.growthRate > 0 ? '+' : ''}
                  {item.growthRate}%
                </span>
              ),
            },
            {
              className: 'min-w-20',
              header: 'Virality',
              key: 'viralityScore',
              render: (item) => (
                <Badge
                  value={item.viralityScore}
                  className={`text-xs ${getViralityBadgeClass(item.viralityScore)}`}
                />
              ),
            },
          ]}
        />
      )}
    </>
  );
}
