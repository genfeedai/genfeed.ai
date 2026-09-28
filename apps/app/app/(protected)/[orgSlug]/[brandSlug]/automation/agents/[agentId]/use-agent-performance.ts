import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useVisiblePolling } from '@hooks/ui/use-visible-polling/use-visible-polling';
import type {
  AgentStrategyPerformanceSnapshot,
  AgentStrategyReport,
} from '@services/automation/agent-strategies.service';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { useQuery } from '@tanstack/react-query';

export interface UseAgentPerformanceResult {
  snapshot: AgentStrategyPerformanceSnapshot | undefined;
  isSnapshotLoading: boolean;
  isSnapshotError: boolean;
  reports: AgentStrategyReport[];
  isReportsLoading: boolean;
  isReportsError: boolean;
}

/**
 * The agent's performance snapshot and reports — shared by the Activity
 * timeline's Reports filter and (previously) `AgentPerformanceSection`.
 * Same query keys, so react-query keeps serving one cache entry (#5483).
 */
export function useAgentPerformance(
  agentId: string,
): UseAgentPerformanceResult {
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

  return {
    isReportsError: reports.isError,
    isReportsLoading: reports.isLoading,
    isSnapshotError: snapshot.isError,
    isSnapshotLoading: snapshot.isLoading,
    reports: reports.data ?? [],
    snapshot: snapshot.data,
  };
}
