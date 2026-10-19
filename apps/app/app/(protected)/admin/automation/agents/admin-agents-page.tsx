'use client';

import { AgentAutonomyMode } from '@genfeedai/contracts';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import AdminOrgBrandUrlFilter, {
  useAdminOrgBrandParams,
} from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { formatDistanceToNow } from 'date-fns';
import { BrainCircuit } from 'lucide-react';
import { useEffect } from 'react';

const AGENT_COLUMNS: TableColumn<AgentStrategy>[] = [
  {
    header: 'Agent',
    key: 'label',
    subtext: (strategy) => strategy.agentType,
  },
  {
    header: 'Brand',
    key: 'brand',
    render: (strategy) => strategy.brand?.label ?? '—',
  },
  {
    header: 'Platforms',
    key: 'platforms',
    render: (strategy) => strategy.platforms?.join(', ') || '—',
  },
  {
    header: 'Status',
    key: 'isActive',
    render: (strategy) => (
      <Badge variant={strategy.isActive ? 'success' : 'secondary'}>
        {strategy.isActive ? 'Active' : 'Paused'}
      </Badge>
    ),
  },
  {
    header: 'Publishing',
    key: 'autonomyMode',
    render: (strategy) =>
      strategy.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH ? (
        <Badge variant="success">Auto-publish</Badge>
      ) : (
        <Badge variant="outline">Review first</Badge>
      ),
  },
  {
    header: 'Last run',
    key: 'lastRunAt',
    render: (strategy) =>
      strategy.lastRunAt
        ? formatDistanceToNow(new Date(strategy.lastRunAt), {
            addSuffix: true,
          })
        : 'Never',
  },
];

/**
 * Every organization's agents, the ones that generate and publish on their
 * own. Without an organization filter it lists the operator's own org.
 */
export default function AdminAgentsPage() {
  const { isSignedIn } = useAuthIdentity();
  const notificationsService = NotificationsService.getInstance();
  const { brand, organization } = useAdminOrgBrandParams();

  const getAgentStrategiesService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  const {
    data: strategies = [],
    error,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    enabled: !!isSignedIn,
    queryFn: async () => {
      const service = await getAgentStrategiesService();
      return service.findAllPages({
        ...(organization ? { organizationId: organization } : {}),
        ...(brand ? { brandId: brand } : {}),
        sort: 'createdAt: -1',
      });
    },
    queryKey: ['admin-agent-strategies', organization, brand],
  });

  useEffect(() => {
    if (error) {
      logger.error('GET /agent-strategies failed', error);
      notificationsService.error('Failed to load agents');
    }
  }, [error, notificationsService]);

  return (
    <AdminPageShell
      title="Agents"
      icon={BrainCircuit}
      onRefresh={() => {
        void refetch();
      }}
      isRefreshing={isFetching && !isLoading}
      dropdowns={<AdminOrgBrandUrlFilter />}
    >
      <AppTable<AgentStrategy>
        items={strategies}
        columns={AGENT_COLUMNS}
        isLoading={isLoading}
        getRowKey={(strategy) => strategy.id}
        emptyLabel="No agents found"
      />
    </AdminPageShell>
  );
}
