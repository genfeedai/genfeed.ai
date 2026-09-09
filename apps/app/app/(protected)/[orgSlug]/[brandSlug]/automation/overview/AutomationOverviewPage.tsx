'use client';

import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { APP_DISPLAY_LABELS } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import { useWorkflowExecutions } from '@hooks/data/workflow-executions/use-workflow-executions';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useQuery } from '@tanstack/react-query';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Users, Workflow } from 'lucide-react';
import { useMemo } from 'react';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';
import ContentPlansSection from '../autopilot/ContentPlansSection';
import ActiveRunsPanel from '../runs/ActiveRunsPanel';
import RunHistoryList from '../runs/RunHistoryList';
import RunStatsStrip from '../runs/RunStatsStrip';

const RECENT_RUN_PAGE_SIZE = 8;
const OVERVIEW_EXECUTION_LIMIT = 20;
const WORKFLOW_COUNT_PAGE_SIZE = 1;

export default function AutomationOverviewPage() {
  const collectionScope = useCollectionScope();
  const isReady = isCollectionFetchReady(collectionScope);
  const brandParams = toBrandListParams(collectionScope);
  const { cancelExecution, executions, isError, isLoading, refresh, stats } =
    useWorkflowExecutions(
      { ...brandParams, limit: OVERVIEW_EXECUTION_LIMIT, sort: '-createdAt' },
      { enabled: isReady },
    );
  const { isLoading: areAgentsLoading, strategies } = useAgentStrategies({
    ...brandParams,
    enabled: isReady,
  });
  const getWorkflowService = useAuthedService(createWorkflowApiService);
  const workflowsQuery = useQuery({
    enabled: isReady,
    queryFn: async () => {
      const service = await getWorkflowService();
      return service.listPage({
        ...brandParams,
        limit: WORKFLOW_COUNT_PAGE_SIZE,
        page: 1,
      });
    },
    queryKey: [
      'automation-overview-workflows',
      collectionScope.organizationId,
      collectionScope.brandId ?? 'org',
    ],
  });

  const workflowTotal = workflowsQuery.data?.pagination.total ?? 0;
  const activeAgents = strategies.filter(
    (strategy) => strategy.isActive,
  ).length;

  const activeExecutions = useMemo(
    () =>
      executions.filter(
        (execution) =>
          execution.status === WorkflowExecutionStatus.PENDING ||
          execution.status === WorkflowExecutionStatus.RUNNING,
      ),
    [executions],
  );
  const recentExecutions = useMemo(
    () =>
      executions.filter(
        (execution) =>
          execution.status !== WorkflowExecutionStatus.PENDING &&
          execution.status !== WorkflowExecutionStatus.RUNNING,
      ),
    [executions],
  );

  return (
    <Container
      label={APP_DISPLAY_LABELS.automation}
      description="Live runs, failures, and scheduled work across this brand"
    >
      {isError && executions.length === 0 ? (
        <ErrorFallback
          title="Automation activity could not be loaded."
          resetErrorBoundary={() => void refresh()}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <RunStatsStrip isLoading={isLoading} stats={stats} />

          <KPISection
            gridCols={{ desktop: 2, mobile: 2, tablet: 2 }}
            isLoading={areAgentsLoading || workflowsQuery.isLoading}
            items={[
              {
                icon: Users,
                label: 'Agents',
                value: strategies.length.toLocaleString(),
                description: `${activeAgents.toLocaleString()} active`,
              },
              {
                icon: Workflow,
                label: 'Workflows',
                value: workflowTotal.toLocaleString(),
                description: 'In this workspace',
              },
            ]}
          />

          <WorkspaceSurface
            data-testid="automation-overview-active"
            density="compact"
            description="Work currently pending or running"
            flush={activeExecutions.length > 0}
            title="Active runs"
          >
            {activeExecutions.length > 0 ? (
              <ActiveRunsPanel
                executions={activeExecutions}
                isHeadingVisible={false}
                onCancel={cancelExecution}
              />
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">
                {isLoading
                  ? 'Loading active runs…'
                  : 'No automation running right now.'}
              </p>
            )}
          </WorkspaceSurface>

          <WorkspaceSurface
            data-testid="automation-overview-recent"
            density="compact"
            description="Latest finished, failed, and cancelled executions"
            flush
            title="Recent activity"
          >
            <RunHistoryList
              currentPage={1}
              executions={recentExecutions}
              isLoading={isLoading}
              onPageChange={() => undefined}
              pageSize={RECENT_RUN_PAGE_SIZE}
            />
          </WorkspaceSurface>

          <ContentPlansSection />
        </div>
      )}
    </Container>
  );
}
