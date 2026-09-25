import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useVisiblePolling } from '@hooks/ui/use-visible-polling/use-visible-polling';
import type { AgentDetailPageProps } from '@props/automation/agent-strategy.props';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

export default function AgentPerformanceSection({
  agentId,
}: AgentDetailPageProps) {
  const scope = useCollectionScope();
  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );
  const enabled = isCollectionFetchReady(scope);
  const snapshot = useQuery({
    queryKey: [
      'agent-performance',
      scope.organizationId,
      scope.brandId,
      agentId,
    ],
    enabled,
    queryFn: async () => (await getService()).getPerformanceSnapshot(agentId),
  });
  const reports = useQuery({
    queryKey: ['agent-reports', scope.organizationId, scope.brandId, agentId],
    enabled,
    queryFn: async () => (await getService()).listReports(agentId),
  });
  useVisiblePolling(
    () => {
      void snapshot.refetch();
      void reports.refetch();
    },
    { intervalMs: 30_000, isEnabled: enabled },
  );
  const daily = reports.data
    ?.filter((report) => report.reportType === 'daily')
    .toSorted(
      (a, b) =>
        new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime(),
    )[0];
  const metrics = snapshot.data;
  const detail = useTranslations('common.automation.agentDetail');
  const unavailable = detail('unavailable');

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section
        aria-label={detail('performanceLabel')}
        className="space-y-3 rounded border border-border p-4"
      >
        <h2 className="text-lg font-semibold">{detail('performanceTitle')}</h2>
        {snapshot.isLoading ? (
          <p role="status">{detail('loadingPerformance')}</p>
        ) : snapshot.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {detail('performanceError')}
          </p>
        ) : metrics ? (
          <>
            <p className="text-sm">
              {detail('counts', {
                generated: metrics.generatedCount,
                published: metrics.publishedCount,
                credits: metrics.creditsSpent,
              })}
            </p>
            <p className="text-sm">
              {detail('engagement', {
                impressions: metrics.impressions,
                clicks: metrics.clicks,
                visits: metrics.visits ?? unavailable,
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {detail('attributed')}
            </p>
            {metrics.sampling?.truncated && (
              <p className="text-xs text-muted-foreground">
                {detail('partialSample', {
                  postsSampled: metrics.sampling.postsSampled,
                  matchedPosts: metrics.sampling.matchedPosts,
                  measurementsSampled: metrics.sampling.measurementsSampled,
                  matchedMeasurements: metrics.sampling.matchedMeasurements,
                })}
              </p>
            )}
            {metrics.impressions === 0 &&
              metrics.clicks === 0 &&
              (metrics.visits ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">
                  {detail('noMeasuredPerformance')}
                </p>
              )}
            {metrics.topTopics.length > 0 && (
              <p className="text-sm">
                {detail('topTopics', { topics: metrics.topTopics.join(', ') })}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {detail('noSnapshot')}
          </p>
        )}
      </section>
      <section
        aria-label={detail('reportLabel')}
        className="space-y-3 rounded border border-border p-4"
      >
        <h2 className="text-lg font-semibold">{detail('latestReport')}</h2>
        {reports.isLoading ? (
          <p role="status">{detail('loadingReport')}</p>
        ) : reports.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {detail('reportError')}
          </p>
        ) : daily ? (
          <>
            <p className="text-xs text-muted-foreground">
              {new Date(daily.periodStart).toLocaleDateString('en-US', {
                timeZone: 'UTC',
              })}{' '}
              –{' '}
              {new Date(daily.periodEnd).toLocaleDateString('en-US', {
                timeZone: 'UTC',
              })}
            </p>
            {daily.summary && <p className="text-sm">{daily.summary}</p>}
            <p className="text-sm">
              {detail('counts', {
                generated: daily.generatedCount,
                published: daily.publishedCount,
                credits: daily.creditsSpent,
              })}
            </p>
            <h3 className="text-sm font-medium">{detail('measuredTitle')}</h3>
            <p className="text-xs text-muted-foreground">
              {daily.metadata?.measurementBasis ||
                detail('measurementUnavailable')}
            </p>
            <p className="text-sm">
              {detail('attributedVisits', {
                impressions: daily.impressions,
                clicks: daily.clicks,
                visits: daily.visits ?? unavailable,
              })}
            </p>
            <h3 className="text-sm font-medium">{detail('recommendations')}</h3>
            {daily.allocationChanges.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {daily.allocationChanges.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {detail('noRecommendations')}
              </p>
            )}
            {daily.topHooks.length > 0 && (
              <p className="text-sm">
                {detail('topHooks', { hooks: daily.topHooks.join(', ') })}
              </p>
            )}
            {daily.bestPostingWindows.length > 0 && (
              <p className="text-sm">
                {detail('bestWindows', {
                  windows: daily.bestPostingWindows.join(', '),
                })}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{detail('noReport')}</p>
        )}
      </section>
    </div>
  );
}
