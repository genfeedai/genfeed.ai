'use client';

import { ComponentSize, WorkflowExecutionStatus } from '@genfeedai/contracts';
import { useWorkflowExecutions } from '@hooks/data/workflow-executions/use-workflow-executions';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import Container from '@ui/layout/container/Container';
import FormSearchbar from '@ui/primitives/searchbar';
import { useMemo, useState } from 'react';
import ActiveRunsPanel from './ActiveRunsPanel';
import RunHistoryList from './RunHistoryList';
import RunStatsStrip from './RunStatsStrip';

export default function MissionControl() {
  const [searchQuery, setSearchQuery] = useState('');
  const {
    cancelExecution,
    executions,
    isLoading,
    isError,
    isRefreshing,
    refresh,
    stats,
  } = useWorkflowExecutions({ limit: 100, sort: '-createdAt' });

  const filteredExecutions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return executions;
    return executions.filter((execution) => {
      const label = execution.workflow?.label ?? execution.workflowId;
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
      right={
        <>
          <FormSearchbar
            className="w-full sm:w-64"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search workflow executions"
            size={ComponentSize.SM}
            value={searchQuery}
          />
          <ButtonRefresh onClick={refresh} isRefreshing={isRefreshing} />
        </>
      }
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
            <RunStatsStrip isLoading={isLoading} stats={stats} />

            <ActiveRunsPanel
              executions={activeExecutions}
              onCancel={cancelExecution}
            />

            <RunHistoryList
              onClearFilter={searchQuery ? () => setSearchQuery('') : undefined}
              executions={historyExecutions}
              isLoading={isLoading}
            />
          </>
        )}
      </div>
    </Container>
  );
}
