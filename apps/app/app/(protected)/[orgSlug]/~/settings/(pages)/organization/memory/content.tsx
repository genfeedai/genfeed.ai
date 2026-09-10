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
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

export default function SettingsOrganizationMemoryPage() {
  const translate = useTranslations('common.settings.memory');
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
  const [loadError, setLoadError] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const authorLabel = useCallback(
    (entry: OrgMemoryEntry): string =>
      entry.user?.name ||
      entry.user?.handle ||
      entry.user?.email ||
      entry.user?.id ||
      translate('unknownAuthor'),
    [translate],
  );

  const scopeLabel = useCallback(
    (scope?: string | null): string => {
      if (scope === 'org') {
        return translate('scope.org');
      }
      if (scope === 'brand') {
        return translate('scope.brand');
      }
      return scope || translate('scope.unknown');
    },
    [translate],
  );

  const loadEntries = useCallback(
    async (signal?: AbortSignal) => {
      if (!isBillingEnabled) {
        setEntries([]);
        return;
      }

      setEntries(null);
      setLoadError(false);
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
        notificationsService.error(translate('notifications.loadFailed'));
        setLoadError(true);
        setEntries([]);
      }
    },
    [getMemoriesService, isBillingEnabled, notificationsService, translate],
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
          notificationsService.success(translate('notifications.archived'));
        } else if (action === 'promote') {
          await service.promote(entry.id);
          notificationsService.success(translate('notifications.promoted'));
        } else {
          await service.reject(entry.id);
          notificationsService.success(translate('notifications.rejected'));
        }
        await loadEntries();
      } catch (error) {
        logger.error(`Memory ${action} failed`, error);
        notificationsService.error(translate('error.update'));
      } finally {
        setPendingId(null);
      }
    },
    [getMemoriesService, loadEntries, notificationsService, translate],
  );

  const columns: TableColumn<OrgMemoryEntry>[] = [
    {
      header: translate('columns.memory'),
      key: 'summary',
      render: (entry) => entry.summary || entry.content || '-',
    },
    {
      header: translate('columns.author'),
      key: 'user',
      render: authorLabel,
    },
    {
      header: translate('columns.scope'),
      key: 'scope',
      render: (entry) => (
        <Badge variant="secondary">{scopeLabel(entry.scope)}</Badge>
      ),
    },
    {
      header: translate('columns.status'),
      key: 'promotedSkillId',
      render: (entry) =>
        entry.promotedSkillId ? (
          <Badge variant="success">{translate('status.promoted')}</Badge>
        ) : (
          <Badge variant="secondary">{translate('status.active')}</Badge>
        ),
    },
    {
      header: translate('columns.created'),
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
              {translate('actions.viewSubscription')}
            </Link>
          </Button>
        }
        description={translate('billedDescription')}
        icon={Lock}
        label={translate('billedTitle')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{translate('heading')}</h1>
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
                  tooltip: translate('actions.promote'),
                },
                {
                  icon: <X />,
                  isDisabled: (entry) =>
                    Boolean(entry.promotedSkillId) || pendingId === entry.id,
                  isVisible: (entry) => !entry.promotedSkillId,
                  onClick: (entry) => void runAction(entry, 'reject'),
                  tooltip: translate('actions.reject'),
                },
                {
                  icon: <Archive />,
                  isDisabled: (entry) => pendingId === entry.id,
                  onClick: (entry) => void runAction(entry, 'archive'),
                  tooltip: translate('actions.archive'),
                },
              ]
            : []
        }
        columns={columns}
        description={translate('description')}
        emptyLabel={translate('empty')}
        error={
          loadError
            ? {
                onRetry: () => {
                  void loadEntries();
                },
                title: translate('error.load'),
              }
            : undefined
        }
        getRowKey={(entry) => entry.id}
        isLoading={entries === null}
        items={entries ?? []}
        label={translate('table')}
      />
    </div>
  );
}
