'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useInsights } from '@hooks/data/analytics/use-insights/use-insights';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { InsightsOverviewProps } from '@props/analytics/insights.props';
import { InsightListCard } from '@ui/analytics/insights';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { RefreshCw, Sparkles } from 'lucide-react';
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
    isRefreshing,
    status,
    unavailableReason,
    refresh,
    markInsightRead,
    dismissInsight,
  } = useInsights({ brandId, enabled: !!brandId });

  return (
    <Container
      label="AI Insights"
      description="AI-driven analytics and recommendations."
      icon={Sparkles}
      right={
        <Button
          onClick={refresh}
          isDisabled={isRefreshing}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          className="gap-2"
          icon={
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          }
          label="Refresh"
        />
      }
      className={className}
    >
      <div className="space-y-6">
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
    </Container>
  );
});

export default InsightsOverview;
