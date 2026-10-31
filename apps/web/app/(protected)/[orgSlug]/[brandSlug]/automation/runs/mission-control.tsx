'use client';

import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { getWorkflowExecutionLabel } from '@genfeedai/helpers/automation/workflow-execution.helper';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import Container from '@ui/layout/container/Container';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import { useWorkflowExecutions } from '@/hooks/data/workflow-executions/use-workflow-executions';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';
import ActiveRunsPanel from './ActiveRunsPanel';
import RunHistoryList from './RunHistoryList';
import RunStatsStrip from './RunStatsStrip';

// Run and credits are derived from the workflow and its accounting, which the
// API cannot order by.
const RUN_SORT_KEYS = ['status', 'durationMs', 'createdAt'];

export default function MissionControl() {
  const collectionScope = useCollectionScope();
  const isReady = isCollectionFetchReady(collectionScope);
  const brandParams = toBrandListParams(collectionScope);
  const [searchQuery, setSearchQuery] = useState('');
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: RUN_SORT_KEYS,
  });
  const {
    cancelExecution,
    executions,
    isLoading,
    isError,
    isRefreshing,
    isStatsDegraded,
    refresh,
    stats,
  } = useWorkflowExecutions(
    {
      ...brandParams,
      limit: ITEMS_PER_PAGE,
      page: currentPage,
      sort: sort ?? 'createdAt: -1',
    },
    { enabled: isReady },
  );

  const filteredExecutions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return executions;
    return executions.filter((execution) => {
      const label = getWorkflowExecutionLabel(execution);
      return (
        label.toLowerCase().includes(query) ||
        execution.id.toLowerCase().includes(query) ||
        execution.error?.toLowerCase().includes(query)
      );
    });
  }, [executions, searchQuery]);

  const activeExecutions = filteredExecutions.filter(
    (execution) =>
      execution.status === WorkflowExecutionStatus.PENDING ||
      execution.status === WorkflowExecutionStatus.RUNNING,
  );
  const historyExecutions = filteredExecutions.filter(
    (execution) =>
      execution.status !== WorkflowExecutionStatus.PENDING &&
      execution.status !== WorkflowExecutionStatus.RUNNING,
  );

  return (
    <Container
      label="Workflow Executions"
      titleVisibility="sr-only"
      leading={
        <SearchField
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search workflow executions"
          value={searchQuery}
        />
      }
      refresh={<ButtonRefresh onClick={refresh} isRefreshing={isRefreshing} />}
    >
      <div className="flex flex-col gap-6">
        {isError && executions.length > 0 ? (
          <ErrorFallback
            compact
            title="Workflow executions could not be refreshed."
            resetErrorBoundary={refresh}
          />
        ) : null}
        {isError && executions.length === 0 ? (
          <ErrorFallback
            title="Workflow executions could not be loaded."
            resetErrorBoundary={() => refresh()}
          />
        ) : (
          <>
            <RunStatsStrip
              isLoading={isLoading}
              isStatsDegraded={isStatsDegraded}
              stats={stats}
            />

            <ActiveRunsPanel
              executions={activeExecutions}
              onCancel={cancelExecution}
            />

            <RunHistoryList
              executions={historyExecutions}
              isLoading={isLoading}
              isPaginated
              onClearFilter={searchQuery ? () => setSearchQuery('') : undefined}
              onSortChange={onSortChange}
              sortDirection={sortDirection}
              sortKey={sortKey}
            />
          </>
        )}
      </div>
    </Container>
  );
}
