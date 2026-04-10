'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  formatCompactNumberIntl,
  formatHour,
  formatPercentage,
} from '@genfeedai/helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type { AudienceInsightsCardProps } from '@genfeedai/props/analytics/insights.props';
import Card from '@ui/card/Card';
import { memo } from 'react';
import {
  HiArrowTrendingDown,
  HiArrowTrendingUp,
  HiClock,
  HiMinus,
  HiUserGroup,
  HiUsers,
} from 'react-icons/hi2';

const AudienceInsightsCard = memo(function AudienceInsightsCard({
  segments,
  isLoading = false,
  className,
}: AudienceInsightsCardProps) {
  if (isLoading) {
    return (
      <Card
        label="Audience Insights"
        icon={HiUsers}
        iconClassName="text-accent"
        className={className}
      >
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse p-4 bg-background space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-5 bg-muted w-32" />
                <div className="h-4 bg-muted w-20" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="h-12 bg-muted" />
                <div className="h-12 bg-muted" />
                <div className="h-12 bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (segments.length === 0) {
    return (
      <Card
        label="Audience Insights"
        icon={HiUsers}
        iconClassName="text-accent"
        className={className}
      >
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <HiUserGroup className="w-12 h-12 text-foreground/30 mb-3" />
          <p className="text-foreground/70 font-medium">
            No audience data available
          </p>
          <p className="text-sm text-foreground/50">
            Audience insights will appear as your content reaches more viewers
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      label="Audience Insights"
      icon={HiUsers}
      iconClassName="text-accent"
      description="Understand your audience segments"
      className={className}
    >
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {segments.map((segment) => {
          const GrowthIcon =
            segment.growth > 0
              ? HiArrowTrendingUp
              : segment.growth < 0
                ? HiArrowTrendingDown
                : HiMinus;
          const growthColor =
            segment.growth > 0
              ? 'text-success'
              : segment.growth < 0
                ? 'text-error'
                : 'text-foreground/50';

          return (
            <div
              key={segment.id}
              className="p-4 bg-background hover:bg-background/80 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-foreground">
                  {segment.name}
                </h4>
                <div
                  className={cn('flex items-center gap-1 text-sm', growthColor)}
                >
                  <GrowthIcon className="w-4 h-4" />
                  <span className="font-mono">
                    {formatPercentage(segment.growth)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
                <div className="text-center p-2 bg-muted/50">
                  <p className="text-2xl font-bold text-primary">
                    {formatCompactNumberIntl(segment.size)}
                  </p>
                  <p className="text-xs text-foreground/50">Audience Size</p>
                </div>
                <div className="text-center p-2 bg-muted/50">
                  <p className="text-2xl font-bold text-secondary">
                    {segment.engagement.toFixed(1)}%
                  </p>
                  <p className="text-xs text-foreground/50">Engagement</p>
                </div>
                <div className="text-center p-2 bg-muted/50 col-span-2 md:col-span-1">
                  <div className="flex items-center justify-center gap-1">
                    <HiClock className="w-4 h-4 text-foreground/50" />
                    <p className="text-lg font-bold">
                      {segment.peakHours.slice(0, 2).map(formatHour).join(', ')}
                    </p>
                  </div>
                  <p className="text-xs text-foreground/50">Peak Hours</p>
                </div>
              </div>

              {segment.platforms.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-foreground/50">Active on:</span>
                  <div className="flex items-center gap-1">
                    {segment.platforms.map((platform) => (
                      <span key={platform}>
                        {getPlatformIcon(platform, 'w-4 h-4')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {segment.topContent.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-foreground/50 mb-1">
                    Top performing content types:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {segment.topContent.slice(0, 3).map((content) => (
                      <span
                        key={content}
                        className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground/70"
                      >
                        {content}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
});

export default AudienceInsightsCard;
