'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IAgentStrategyRunHistoryItem,
  IWorkflowExecution,
} from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import { ListRow } from '@ui/lists/list-row/ListRow';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type { AgentActivityFilter } from './agent-activity-timeline.helper';
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

export interface AgentActivitySectionProps {
  agentId: string;
  runHistory: IAgentStrategyRunHistoryItem[];
  executions: IWorkflowExecution[];
  isExecutionsLoading: boolean;
  isExecutionsError: boolean;
}

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

  return (
    <CollectionSection
      actions={
        <Select
          onValueChange={(value) => setFilter(value as AgentActivityFilter)}
          value={filter}
        >
          <SelectTrigger
            aria-label={translate('activityFilterAria')}
            className="w-40"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {translate('activityFilterAll')}
            </SelectItem>
            <SelectItem value="content">
              {translate('activityFilterContent')}
            </SelectItem>
            <SelectItem value="report">
              {translate('activityFilterReports')}
            </SelectItem>
            <SelectItem value="run">
              {translate('activityFilterRuns')}
            </SelectItem>
          </SelectContent>
        </Select>
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
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate('activityEmpty')}
          </p>
        )}
      </div>
    </CollectionSection>
  );
}
