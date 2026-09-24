import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useVisiblePolling } from '@hooks/ui/use-visible-polling/use-visible-polling';
import type { AgentDetailPageProps } from '@props/automation/agent-strategy.props';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { useQuery } from '@tanstack/react-query';

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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section
        aria-label="Agent performance"
        className="space-y-3 rounded border border-border p-4"
      >
        <h2 className="text-lg font-semibold">Performance</h2>
        {snapshot.isLoading ? (
          <p role="status">Loading agent performance…</p>
        ) : snapshot.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load agent performance.
          </p>
        ) : metrics ? (
          <>
            <p className="text-sm">
              {metrics.generatedCount} generated · {metrics.publishedCount}{' '}
              published · {metrics.creditsSpent} credits
            </p>
            <p className="text-sm">
              {metrics.impressions} impressions · {metrics.clicks} clicks ·{' '}
              {metrics.visits ?? 'Unavailable'} visits
            </p>
            <p className="text-xs text-muted-foreground">
              Attributed to content from this agent.
            </p>
            {metrics.sampling?.truncated && (
              <p className="text-xs text-muted-foreground">
                Partial sample: {metrics.sampling.postsSampled} of{' '}
                {metrics.sampling.matchedPosts} posts and{' '}
                {metrics.sampling.measurementsSampled} of{' '}
                {metrics.sampling.matchedMeasurements} measurements.
              </p>
            )}
            {metrics.impressions === 0 &&
              metrics.clicks === 0 &&
              (metrics.visits ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">
                  No measured performance yet.
                </p>
              )}
            {metrics.topTopics.length > 0 && (
              <p className="text-sm">
                Top topics: {metrics.topTopics.join(', ')}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No performance snapshot yet.
          </p>
        )}
      </section>
      <section
        aria-label="Daily agent report"
        className="space-y-3 rounded border border-border p-4"
      >
        <h2 className="text-lg font-semibold">Latest daily report</h2>
        {reports.isLoading ? (
          <p role="status">Loading daily report…</p>
        ) : reports.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load daily report.
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
              {daily.generatedCount} generated · {daily.publishedCount}{' '}
              published · {daily.creditsSpent} credits
            </p>
            <h3 className="text-sm font-medium">
              Measured content performance
            </h3>
            <p className="text-xs text-muted-foreground">
              {daily.metadata?.measurementBasis ||
                'Performance measurement period unavailable.'}
            </p>
            <p className="text-sm">
              {daily.impressions} impressions · {daily.clicks} clicks ·{' '}
              {daily.visits ?? 'Unavailable'} visits attributed to this agent.
            </p>
            <h3 className="text-sm font-medium">Recommendations</h3>
            {daily.allocationChanges.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {daily.allocationChanges.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No allocation recommendations yet.
              </p>
            )}
            {daily.topHooks.length > 0 && (
              <p className="text-sm">Top hooks: {daily.topHooks.join(', ')}</p>
            )}
            {daily.bestPostingWindows.length > 0 && (
              <p className="text-sm">
                Best posting windows: {daily.bestPostingWindows.join(', ')}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No daily report yet.</p>
        )}
      </section>
    </div>
  );
}
