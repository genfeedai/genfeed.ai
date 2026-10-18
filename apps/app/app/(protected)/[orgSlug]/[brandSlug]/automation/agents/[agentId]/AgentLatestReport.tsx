'use client';

import type { AgentLatestReportProps } from '@props/automation/agent-latest-report.props';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import { useTranslations } from 'next-intl';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { useAgentPerformance } from './use-agent-performance';

/**
 * The newest report the agent wrote (one per proactive run, plus the
 * scheduled daily/weekly digests): its summary, the run's counts and the
 * allocation recommendations for the next run. Shares the report query with
 * the Activity feed, so it adds no request.
 */
export default function AgentLatestReport({ agentId }: AgentLatestReportProps) {
  const detail = useTranslations('common.automation.agentDetail');
  const { reports, isReportsLoading, isReportsError } =
    useAgentPerformance(agentId);
  const report = reports[0];
  // Report rows are stored JSON; older rows may omit the list fields.
  const topTopics = report?.topTopics ?? [];
  const topHooks = report?.topHooks ?? [];
  const recommendations = report?.allocationChanges ?? [];

  return (
    <CollectionSection
      data-testid="agent-latest-report"
      error={isReportsError ? detail('reportError') : undefined}
      isLoading={isReportsLoading}
      title={detail('latestReport')}
    >
      {isReportsLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          {detail('loadingReport')}
        </p>
      ) : report ? (
        <Card bodyClassName="flex flex-col gap-2 px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {detail(
              report.reportType === 'daily'
                ? 'activityDailyReport'
                : 'activityWeeklyReport',
            )}
            {' · '}
            <ClientFormattedDate format="relative" value={report.periodEnd} />
          </p>
          {report.summary ? (
            <p className="text-foreground">{report.summary}</p>
          ) : null}
          <p className="text-muted-foreground">
            {detail('counts', {
              credits: report.creditsSpent,
              generated: report.generatedCount,
              published: report.publishedCount,
            })}
          </p>
          {topTopics.length > 0 ? (
            <p className="text-muted-foreground">
              {detail('topTopics', { topics: topTopics.join(', ') })}
            </p>
          ) : null}
          {topHooks.length > 0 ? (
            <p className="text-muted-foreground">
              {detail('topHooks', { hooks: topHooks.join(', ') })}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-foreground">
              {detail('recommendations')}
            </p>
            {recommendations.length > 0 ? (
              <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
                {recommendations.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                {detail('noRecommendations')}
              </p>
            )}
          </div>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">{detail('noReport')}</p>
      )}
    </CollectionSection>
  );
}
