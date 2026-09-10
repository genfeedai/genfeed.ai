'use client';

import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { ButtonVariant, MemberRole } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { OrgMemoryEntry } from '@props/settings/org-memory.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { AgentMemoriesService } from '@services/automation/agent-memories.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import AppTable from '@ui/display/table/Table';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Archive, Lock, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

function authorLabel(entry: OrgMemoryEntry): string {
  return (
    entry.user?.name ||
    entry.user?.handle ||
    entry.user?.email ||
    entry.user?.id ||
    'Unknown'
  );
}

function scopeLabel(scope?: string | null): string {
  if (scope === 'org') {
    return 'Organization';
  }
  if (scope === 'brand') {
    return 'Brand';
  }
  return scope || 'Unknown';
}

export default function SettingsOrganizationMemoryPage() {
  const notificationsService = NotificationsService.getInstance();
  const userRole = useUserRole();
  const { orgHref } = useOrgUrl();
  const isBillingEnabled = hasOrganizationBillingHint();
  const canGovern =
    userRole === MemberRole.OWNER || userRole === MemberRole.ADMIN;
  const getMemoriesService = useAuthedService(
    useCallback((token: string) => AgentMemoriesService.getInstance(token), []),
  );

  const [entries, setEntries] = useState<OrgMemoryEntry[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadEntries = useCallback(
    async (signal?: AbortSignal) => {
      if (!isBillingEnabled) {
        setEntries([]);
        return;
      }

      setEntries(null);
      try {
        const service = await getMemoriesService();
        if (signal?.aborted) {
          return;
        }
        const data = await service.listOrganization();
        if (signal?.aborted) {
          return;
        }
        setEntries(data);
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        logger.error('GET /agent/memories/organization failed', error);
        notificationsService.error('Failed to load organization memory');
        setEntries([]);
      }
    },
    [getMemoriesService, isBillingEnabled, notificationsService],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadEntries(controller.signal);
    return () => controller.abort();
  }, [loadEntries]);

  const runAction = useCallback(
    async (entry: OrgMemoryEntry, action: 'archive' | 'promote' | 'reject') => {
      setPendingId(entry.id);
      try {
        const service = await getMemoriesService();
        if (action === 'archive') {
          await service.archive(entry.id);
          notificationsService.success('Memory archived');
        } else if (action === 'promote') {
          await service.promote(entry.id);
          notificationsService.success('Memory promoted to a skill');
        } else {
          await service.reject(entry.id);
          notificationsService.success('Promotion rejected');
        }
        await loadEntries();
      } catch (error) {
        logger.error(`Memory ${action} failed`, error);
        notificationsService.error('Could not update that memory entry');
      } finally {
        setPendingId(null);
      }
    },
    [getMemoriesService, loadEntries, notificationsService],
  );

  const columns: TableColumn<OrgMemoryEntry>[] = [
    {
      header: 'Memory',
      key: 'summary',
      render: (entry) => entry.summary || entry.content || '-',
    },
    {
      header: 'Author',
      key: 'user',
      render: authorLabel,
    },
    {
      header: 'Scope',
      key: 'scope',
      render: (entry) => (
        <Badge variant="secondary">{scopeLabel(entry.scope)}</Badge>
      ),
    },
    {
      header: 'Status',
      key: 'promotedSkillId',
      render: (entry) =>
        entry.promotedSkillId ? (
          <Badge variant="success">Promoted</Badge>
        ) : (
          <Badge variant="secondary">Active</Badge>
        ),
    },
    {
      header: 'Created',
      key: 'createdAt',
      render: (entry) => (entry.createdAt ? formatDate(entry.createdAt) : '-'),
    },
  ];

  if (!isBillingEnabled) {
    return (
      <CardEmpty
        actions={
          <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
            <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
              View subscription
            </Link>
          </Button>
        }
        description="Shared org memory listing, archive, and skill promotion are available on Cloud and Enterprise."
        icon={Lock}
        label="Organization memory is a billed feature"
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Organization memory</h1>
      <AppTable<OrgMemoryEntry>
        actions={
          canGovern
            ? [
                {
                  icon: <Sparkles />,
                  isDisabled: (entry) =>
                    Boolean(entry.promotedSkillId) || pendingId === entry.id,
                  isVisible: (entry) => !entry.promotedSkillId,
                  onClick: (entry) => void runAction(entry, 'promote'),
                  tooltip: 'Promote to skill',
                },
                {
                  icon: <X />,
                  isDisabled: (entry) =>
                    Boolean(entry.promotedSkillId) || pendingId === entry.id,
                  isVisible: (entry) => !entry.promotedSkillId,
                  onClick: (entry) => void runAction(entry, 'reject'),
                  tooltip: 'Reject promotion',
                },
                {
                  icon: <Archive />,
                  isDisabled: (entry) => pendingId === entry.id,
                  onClick: (entry) => void runAction(entry, 'archive'),
                  tooltip: 'Archive',
                },
              ]
            : []
        }
        columns={columns}
        description="Brand and organization memory the agent was taught. Personal entries stay private until promoted."
        emptyLabel="No shared memory yet"
        getRowKey={(entry) => entry.id}
        isLoading={entries === null}
        items={entries ?? []}
        label="Shared memory"
      />
    </div>
  );
}
