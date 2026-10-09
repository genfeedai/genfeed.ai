'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useInsights } from '@hooks/data/analytics/use-insights/use-insights';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { InsightsOverviewProps } from '@props/analytics/insights.props';
import { InsightListCard } from '@ui/analytics/insights';
import Card from '@ui/card/Card';
import { memo } from 'react';
import SocialIntelligenceInbox from './social-intelligence-inbox';

const InsightsOverview = memo(function InsightsOverview({
  brandId: propBrandId,
  className,
}: InsightsOverviewProps) {
  const { brandId: scopedBrandId, organizationId } = useCollectionScope();
  const brandId = propBrandId || scopedBrandId;

  const {
    insights,
    isLoading,
    status,
    unavailableReason,
    markInsightRead,
    dismissInsight,
  } = useInsights({ brandId, enabled: !!brandId });

  return (
    <div className={cn('space-y-6', className)}>
      {status === 'unavailable' ? (
        <Card className="border-warning/30 bg-warning/5">
          <div role="status" className="space-y-1">
            <p className="text-sm font-medium text-warning">
              Analytics insights unavailable
            </p>
            <p className="text-sm text-foreground/70">
              {unavailableReason || 'Provider data is unavailable right now.'}
            </p>
          </div>
        </Card>
      ) : null}

      <SocialIntelligenceInbox
        brandId={brandId}
        organizationId={organizationId}
      />

      <InsightListCard
        insights={insights}
        isLoading={isLoading}
        onMarkRead={markInsightRead}
        onDismiss={dismissInsight}
      />
    </div>
  );
});

export default InsightsOverview;
