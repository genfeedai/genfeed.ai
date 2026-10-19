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
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';

/**
 * Every organization's agents, the ones that generate and publish on their
 * own. Without an organization filter it lists the operator's own org.
 */
export default function AdminAgentsPage() {
  const translate = useTranslations('pages.adminAgents');
  const { isSignedIn } = useAuthIdentity();
  const notificationsService = NotificationsService.getInstance();
  const { brand, organization } = useAdminOrgBrandParams();

  const columns = useMemo<TableColumn<AgentStrategy>[]>(
    () => [
      {
        header: translate('columns.agent'),
        key: 'label',
        subtext: (strategy) => strategy.agentType,
      },
      {
        header: translate('columns.brand'),
        key: 'brand',
        render: (strategy) => strategy.brand?.label ?? '—',
      },
      {
        header: translate('columns.platforms'),
        key: 'platforms',
        render: (strategy) => strategy.platforms?.join(', ') || '—',
      },
      {
        header: translate('columns.status'),
        key: 'isActive',
        render: (strategy) => (
          <Badge variant={strategy.isActive ? 'success' : 'secondary'}>
            {strategy.isActive
              ? translate('status.active')
              : translate('status.paused')}
          </Badge>
        ),
      },
      {
        header: translate('columns.publishing'),
        key: 'autonomyMode',
        render: (strategy) =>
          strategy.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH ? (
            <Badge variant="success">
              {translate('publishing.autoPublish')}
            </Badge>
          ) : (
            <Badge variant="outline">
              {translate('publishing.reviewFirst')}
            </Badge>
          ),
      },
      {
        header: translate('columns.lastRun'),
        key: 'lastRunAt',
        render: (strategy) =>
          strategy.lastRunAt
            ? formatDistanceToNow(new Date(strategy.lastRunAt), {
                addSuffix: true,
              })
            : translate('never'),
      },
    ],
    [translate],
  );

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
      notificationsService.error(translate('loadError'));
    }
  }, [error, notificationsService, translate]);

  return (
    <AdminPageShell
      title={translate('title')}
      icon={BrainCircuit}
      onRefresh={() => {
        void refetch();
      }}
      isRefreshing={isFetching && !isLoading}
      dropdowns={<AdminOrgBrandUrlFilter />}
    >
      <AppTable<AgentStrategy>
        items={strategies}
        columns={columns}
        isLoading={isLoading}
        getRowKey={(strategy) => strategy.id}
        emptyLabel={translate('empty')}
      />
    </AdminPageShell>
  );
}
