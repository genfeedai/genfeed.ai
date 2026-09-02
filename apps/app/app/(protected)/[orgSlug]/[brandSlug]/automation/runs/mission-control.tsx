'use client';

import { ComponentSize, WorkflowExecutionStatus } from '@genfeedai/contracts';
import { useWorkflowExecutions } from '@hooks/data/workflow-executions/use-workflow-executions';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import FormSearchbar from '@ui/primitives/searchbar';
import { useMemo, useState } from 'react';
import ActiveRunsPanel from './ActiveRunsPanel';
import RunHistoryList from './RunHistoryList';
import RunStatsStrip from './RunStatsStrip';

export default function MissionControl() {
  const [searchQuery, setSearchQuery] = useState('');
  const { cancelExecution, executions, isLoading, refresh, stats } =
    useWorkflowExecutions({ limit: 100, sort: '-createdAt' });

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
    <Container>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-end">
          <h1 className="sr-only">Workflow Executions</h1>
          <ButtonRefresh onClick={refresh} />
        </div>

        <RunStatsStrip isLoading={isLoading} stats={stats} />

        <ActiveRunsPanel
          executions={activeExecutions}
          onCancel={cancelExecution}
        />

        <FormSearchbar
          className="w-full"
          inputClassName="gen-card min-h-11 bg-transparent px-3 text-sm"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search workflow executions"
          size={ComponentSize.MD}
          value={searchQuery}
        />

        <RunHistoryList executions={historyExecutions} isLoading={isLoading} />
      </div>
    </Container>
  );
}
