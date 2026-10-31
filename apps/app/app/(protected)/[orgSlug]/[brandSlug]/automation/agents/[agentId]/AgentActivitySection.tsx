'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import { ListRow } from '@ui/lists/list-row/ListRow';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type { AgentActivitySectionProps } from '@/features/automation/props/agent-activity-section.props';
import type { AgentActivityFilter } from '@/features/automation/props/agent-activity-timeline.props';
import {
  filterAgentActivity,
  mergeAgentActivity,
} from './agent-activity-timeline.helper';
import {
  buildContentActivityEntries,
  buildReportActivityEntries,
  buildRunActivityEntries,
} from './build-agent-activity-entries';
import { useAgentDetailPosts } from './use-agent-detail-posts';
import { useAgentPerformance } from './use-agent-performance';

/**
 * One merged, chronologically sorted Activity feed with a single filter,
 * replacing three always-visible stacked sections (content, performance,
 * runs) (#5483, FR4). Every underlying query and its loading/error/empty
 * behavior stays intact — each source's own state still shows inline in the
 * merged view; this only changes how the results are laid out.
 */
export default function AgentActivitySection({
  agentId,
  runHistory,
  executions,
  isExecutionsLoading,
  isExecutionsError,
}: AgentActivitySectionProps) {
  const translate = useTranslations('ui.recordDetail');
  const detail = useTranslations('common.automation.agentDetail');
  const { href } = useOrgUrl();
  const [filter, setFilter] = useState<AgentActivityFilter>('all');

  const {
    posts,
    isLoading: isContentLoading,
    isError: isContentError,
  } = useAgentDetailPosts(agentId);
  const {
    snapshot,
    isSnapshotLoading,
    isSnapshotError,
    reports,
    isReportsLoading,
    isReportsError,
  } = useAgentPerformance(agentId);

  const entries = useMemo(
    () =>
      mergeAgentActivity(
        buildContentActivityEntries(posts, detail, (postId) =>
          href(`${APP_ROUTES.PUBLISHING.POSTS}/${postId}`),
        ),
        buildReportActivityEntries(reports, detail),
        buildRunActivityEntries(
          runHistory,
          executions,
          posts,
          detail,
          (threadId) => href(`${APP_ROUTES.AGENT.ROOT}/${threadId}`),
          (executionId) => href(`${APP_ROUTES.AUTOMATION.RUNS}/${executionId}`),
        ),
      ),
    [detail, executions, href, posts, reports, runHistory],
  );

  const filteredEntries = useMemo(
    () => filterAgentActivity(entries, filter),
    [entries, filter],
  );

  const showContentState = filter === 'all' || filter === 'content';
  const showReportState = filter === 'all' || filter === 'report';
  const showRunState = filter === 'all' || filter === 'run';

  const isRelevantLoading =
    (showContentState && isContentLoading) ||
    (showReportState && (isSnapshotLoading || isReportsLoading)) ||
    (showRunState && isExecutionsLoading);

  const isRelevantError =
    (showContentState && isContentError) ||
    (showReportState && (isSnapshotError || isReportsError)) ||
    (showRunState && isExecutionsError);

  return (
    <CollectionSection
      actions={
        <FilterMenu
          facets={[
            {
              defaultValue: 'all',
              key: 'type',
              label: translate('activityFilterType'),
              onChange: (value) => setFilter(value as AgentActivityFilter),
              options: [
                { label: translate('activityFilterAll'), value: 'all' },
                { label: translate('activityFilterContent'), value: 'content' },
                { label: translate('activityFilterReports'), value: 'report' },
                { label: translate('activityFilterRuns'), value: 'run' },
              ],
              selection: 'single',
              value: filter,
            },
          ]}
          onClear={() => setFilter('all')}
        />
      }
      title={translate('activity')}
    >
      <div className="space-y-4">
        {showReportState &&
        !isSnapshotLoading &&
        !isSnapshotError &&
        snapshot ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              {detail('counts', {
                credits: snapshot.creditsSpent,
                generated: snapshot.generatedCount,
                published: snapshot.publishedCount,
              })}
            </p>
            <p>
              {detail('engagement', {
                clicks: snapshot.clicks,
                impressions: snapshot.impressions,
                visits: snapshot.visits ?? detail('unavailable'),
              })}
            </p>
            {snapshot.sampling?.truncated ? (
              <p className="text-xs">
                {detail('partialSample', {
                  matchedMeasurements: snapshot.sampling.matchedMeasurements,
                  matchedPosts: snapshot.sampling.matchedPosts,
                  measurementsSampled: snapshot.sampling.measurementsSampled,
                  postsSampled: snapshot.sampling.postsSampled,
                })}
              </p>
            ) : null}
          </div>
        ) : null}
        {showReportState && isSnapshotError ? (
          <p className="text-sm text-destructive" role="alert">
            {detail('performanceError')}
          </p>
        ) : null}

        {showContentState && isContentError ? (
          <p className="text-sm text-destructive" role="alert">
            {detail('contentError')}
          </p>
        ) : null}
        {showReportState && isReportsError ? (
          <p className="text-sm text-destructive" role="alert">
            {detail('reportError')}
          </p>
        ) : null}
        {showRunState && isExecutionsError ? (
          <p className="text-sm text-destructive" role="alert">
            {detail('executionsError')}
          </p>
        ) : null}

        {filteredEntries.length > 0 ? (
          <CollectionList>
            {filteredEntries.map((entry) => (
              <ListRow
                description={entry.description}
                key={entry.id}
                meta={
                  <ClientFormattedDate
                    format="relative"
                    value={entry.timestamp}
                  />
                }
                title={entry.title}
                trailing={
                  entry.href ? (
                    <Link className="text-sm underline" href={entry.href}>
                      {translate('activityViewAction')}
                    </Link>
                  ) : null
                }
              />
            ))}
          </CollectionList>
        ) : isRelevantLoading ? (
          <p role="status">{translate('activityLoading')}</p>
        ) : isRelevantError ? null : (
          <p className="text-sm text-muted-foreground">
            {translate('activityEmpty')}
          </p>
        )}
      </div>
    </CollectionSection>
  );
}
