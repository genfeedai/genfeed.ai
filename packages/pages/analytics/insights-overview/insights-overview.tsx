'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AI_ACTION_LABELS,
  AiActionType,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  SmartAlertSeverity,
  TrendDirection,
} from '@genfeedai/enums';
import { useInsights } from '@hooks/data/analytics/use-insights/use-insights';
import type { InsightsOverviewProps } from '@props/analytics/insights.props';
import { AiActionsService } from '@services/ai/ai-actions.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import {
  AnomalyDetectionCard,
  AudienceInsightsCard,
  ContentOptimizationCard,
  SmartAlertsPanel,
  TrendAnalysisCard as TrendAnalysisCardView,
} from '@ui/analytics/insights';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Spinner from '@ui/feedback/spinner/Spinner';
import Container from '@ui/layout/container/Container';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useState } from 'react';
import {
  HiArrowPath,
  HiCheckCircle,
  HiLightBulb,
  HiSparkles,
} from 'react-icons/hi2';

const TrendAnalysisCard = dynamic(
  () => import('@ui/analytics/insights/trend-analysis-card/TrendAnalysisCard'),
  {
    loading: () => (
      <div className="min-h-[240px] rounded-2xl border border-border bg-card/60 p-6 animate-pulse" />
    ),
    ssr: false,
  },
);

const InsightsOverview = memo(function InsightsOverview({
  brandId: propBrandId,
  className,
  aiConfig,
}: InsightsOverviewProps) {
  const router = useRouter();
  const { selectedBrand } = useBrand();
  const brandId = propBrandId || selectedBrand?.id;

  const {
    anomalies,
    trends,
    suggestions,
    audiences,
    alerts,
    isLoading,
    isRefreshing,
    refresh,
    markAlertRead,
    dismissAlert,
  } = useInsights({ brandId, enabled: !!brandId });

  const handleAlertAction = useCallback(
    (alertId: string) => {
      const alert = alerts.find((a) => a.id === alertId);
      if (alert?.actionUrl) {
        router.push(alert.actionUrl);
      }
    },
    [alerts, router],
  );

  const handleAnomalyDismiss = useCallback((_id: string) => {
    // For now, just log - in production this would call an API
    // logger.info('Anomaly dismissed', { id });
  }, []);

  const handleSuggestionApply = useCallback((_id: string) => {
    // For now, just log - in production this would trigger content creation
    // logger.info('Suggestion applied', { id });
  }, []);

  const [activeInsightAction, setActiveInsightAction] = useState<string | null>(
    null,
  );

  const handleInsightAiAction = useCallback(
    async (action: AiActionType, content: string) => {
      if (!aiConfig) {
        return;
      }

      setActiveInsightAction(action);
      try {
        const service = AiActionsService.getInstance(aiConfig.token);
        const response = await service.execute(aiConfig.orgId, {
          action,
          content,
        });

        if (action === AiActionType.CONTENT_SUGGEST) {
          aiConfig.onContentSuggested?.(response.result);
          NotificationsService.getInstance().success(
            'Content suggestions generated',
          );
        } else {
          NotificationsService.getInstance().success('Insight generated');
        }
      } catch (error) {
        logger.error(`Insights AI action ${action} failed`, error);
        NotificationsService.getInstance().error('AI action failed');
      } finally {
        setActiveInsightAction(null);
      }
    },
    [aiConfig],
  );

  // Calculate summary stats
  const criticalAlerts = alerts.filter(
    (a) => a.severity === SmartAlertSeverity.CRITICAL && !a.isDismissed,
  ).length;
  const warningAlerts = alerts.filter(
    (a) => a.severity === SmartAlertSeverity.WARNING && !a.isDismissed,
  ).length;
  const positiveTrends = trends.filter(
    (t) => t.direction === TrendDirection.UP,
  ).length;
  const activeSuggestions = suggestions.length;

  return (
    <Container
      label="AI Insights"
      description="AI-driven analytics and recommendations."
      icon={HiSparkles}
      right={
        <Button
          onClick={refresh}
          isDisabled={isRefreshing}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          className="gap-2"
          icon={
            <HiArrowPath
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          }
          label="Refresh"
        />
      }
      className={className}
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-error/5 border-error/20">
            <div className="text-center py-2">
              <p className="text-3xl font-bold text-error">{criticalAlerts}</p>
              <p className="text-sm text-foreground/70">Critical Alerts</p>
            </div>
          </Card>
          <Card className="bg-warning/5 border-warning/20">
            <div className="text-center py-2">
              <p className="text-3xl font-bold text-warning">{warningAlerts}</p>
              <p className="text-sm text-foreground/70">Warnings</p>
            </div>
          </Card>
          <Card className="bg-success/5 border-success/20">
            <div className="text-center py-2">
              <p className="text-3xl font-bold text-success">
                {positiveTrends}
              </p>
              <p className="text-sm text-foreground/70">Positive Trends</p>
            </div>
          </Card>
          <Card className="bg-info/5 border-info/20">
            <div className="text-center py-2">
              <p className="text-3xl font-bold text-info">
                {activeSuggestions}
              </p>
              <p className="text-sm text-foreground/70">Suggestions</p>
            </div>
          </Card>
        </div>

        {/* Smart Alerts - Full Width */}
        <SmartAlertsPanel
          alerts={alerts}
          isLoading={isLoading}
          onMarkRead={markAlertRead}
          onDismiss={dismissAlert}
          onAction={handleAlertAction}
        />

        {/* Main Grid - 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            <AnomalyDetectionCard
              anomalies={anomalies}
              isLoading={isLoading}
              onDismiss={handleAnomalyDismiss}
            />
            <TrendAnalysisCardView trends={trends} isLoading={isLoading} />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <ContentOptimizationCard
              suggestions={suggestions}
              isLoading={isLoading}
              onApply={handleSuggestionApply}
            />
            <AudienceInsightsCard segments={audiences} isLoading={isLoading} />
          </div>
        </div>

        {/* AI Insights Summary */}
        {!isLoading && (
          <Card
            label="AI Analysis Summary"
            icon={HiLightBulb}
            iconClassName="text-warning"
            className="bg-gradient-to-br from-muted to-background"
          >
            <div className="prose prose-sm max-w-none">
              {criticalAlerts === 0 && warningAlerts === 0 ? (
                <div className="flex items-center gap-3 text-success">
                  <HiCheckCircle className="w-6 h-6 flex-shrink-0" />
                  <p className="m-0">
                    <strong>Great news!</strong> Your content is performing well
                    with no critical issues detected. Keep up the good work!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {criticalAlerts > 0 && (
                    <p className="text-error m-0">
                      <strong>Attention needed:</strong> You have{' '}
                      {criticalAlerts} critical alert
                      {criticalAlerts > 1 ? 's' : ''} that require immediate
                      attention.
                    </p>
                  )}
                  {warningAlerts > 0 && (
                    <p className="text-warning m-0">
                      <strong>Review recommended:</strong> {warningAlerts}{' '}
                      warning
                      {warningAlerts > 1 ? 's' : ''} detected that may impact
                      your performance.
                    </p>
                  )}
                </div>
              )}

              {positiveTrends > 0 && (
                <p className="text-success mt-2 mb-0">
                  {positiveTrends} metric{positiveTrends > 1 ? 's are' : ' is'}{' '}
                  trending upward - your content strategy is working!
                </p>
              )}

              {activeSuggestions > 0 && (
                <p className="text-info mt-2 mb-0">
                  We have {activeSuggestions} optimization suggestion
                  {activeSuggestions > 1 ? 's' : ''} that could boost your
                  performance.
                </p>
              )}

              {aiConfig && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/50">
                  <Button
                    label={
                      activeInsightAction === AiActionType.CONTENT_SUGGEST
                        ? ''
                        : AI_ACTION_LABELS[AiActionType.CONTENT_SUGGEST]
                    }
                    icon={
                      activeInsightAction === AiActionType.CONTENT_SUGGEST ? (
                        <Spinner size={ComponentSize.XS} />
                      ) : (
                        <HiSparkles className="w-3.5 h-3.5" />
                      )
                    }
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.XS}
                    isDisabled={activeInsightAction !== null}
                    onClick={() =>
                      handleInsightAiAction(
                        AiActionType.CONTENT_SUGGEST,
                        `Trends: ${positiveTrends} positive. Alerts: ${criticalAlerts} critical, ${warningAlerts} warnings. Suggestions: ${activeSuggestions} pending.`,
                      )
                    }
                  />
                  <Button
                    label={
                      activeInsightAction === AiActionType.ANALYTICS_INSIGHT
                        ? ''
                        : AI_ACTION_LABELS[AiActionType.ANALYTICS_INSIGHT]
                    }
                    icon={
                      activeInsightAction === AiActionType.ANALYTICS_INSIGHT ? (
                        <Spinner size={ComponentSize.XS} />
                      ) : (
                        <HiSparkles className="w-3.5 h-3.5" />
                      )
                    }
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.XS}
                    isDisabled={activeInsightAction !== null}
                    onClick={() =>
                      handleInsightAiAction(
                        AiActionType.ANALYTICS_INSIGHT,
                        `Anomalies: ${anomalies.map((a) => `${a.metric}: ${a.currentValue} vs expected ${a.expectedValue}`).join(', ')}. Trends: ${trends.map((t) => `${t.metric}: ${t.direction} ${t.changePercent}%`).join(', ')}.`,
                      )
                    }
                  />
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </Container>
  );
});

export default InsightsOverview;
