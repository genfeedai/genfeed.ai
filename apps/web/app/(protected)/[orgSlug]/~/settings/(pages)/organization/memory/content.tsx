'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { ButtonSize, ButtonVariant, MemberRole } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IPagedItems } from '@genfeedai/contracts/interfaces';
import type { OrgMemoryEntry } from '@genfeedai/contracts/interfaces/settings/org-memory.interface';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useRefreshScope } from '@hooks/auth/use-refresh-scope/use-refresh-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TableColumn } from '@props/ui/display/table.props';
import { AgentMemoriesService } from '@services/automation/agent-memories.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { Archive, Lock, Pencil, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useUserRole } from '@/hooks/auth/use-user-role/use-user-role';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';
import EditMemoryDialog from './edit-memory-dialog';

function organizationMemoriesQueryKey(organizationId: string) {
  return ['organization-memories', organizationId] as const;
}

const MEMORY_SORT_KEYS = [
  'summary',
  'user',
  'scope',
  'promotedSkillId',
  'createdAt',
] as const;

export default function SettingsOrganizationMemoryPage() {
  const translate = useTranslations('common.settings.memory');
  const notificationsService = NotificationsService.getInstance();
  const userRole = useUserRole();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: MEMORY_SORT_KEYS,
  });
  const { orgHref } = useOrgUrl();
  const { organizationId } = useBrand();
  const isBillingEnabled = hasOrganizationBillingHint();
  const canGovern =
    userRole === MemberRole.OWNER || userRole === MemberRole.ADMIN;
  const getMemoriesService = useAuthedService(
    useCallback((token: string) => AgentMemoriesService.getInstance(token), []),
  );

  const scopeKey = organizationMemoriesQueryKey(organizationId);
  // The memories read through React Query, so coming back to the page paints
  // the cached rows at once and refreshes them in the background; another
  // page or sort keeps the current rows on screen while it loads.
  const memoriesQuery = useAuthedQuery<
    AgentMemoriesService,
    IPagedItems<OrgMemoryEntry>
  >({
    enabled: isBillingEnabled && Boolean(organizationId),
    keepPreviousDataWithin: scopeKey,
    queryFn: (service, signal) =>
      service.listOrganization(
        {
          limit: ITEMS_PER_PAGE,
          page: currentPage,
          ...(sort ? { sort } : {}),
        },
        signal,
      ),
    queryKey: [...scopeKey, { page: currentPage, sort: sort ?? null }],
    service: (token: string) => AgentMemoriesService.getInstance(token),
  });
  const memoriesPage = memoriesQuery.data ?? null;
  const entries = memoriesPage?.items ?? null;
  // A failed background refresh keeps the rows; the error replaces the table
  // only when there is nothing to show.
  const loadError = Boolean(memoriesQuery.error) && !memoriesPage;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<OrgMemoryEntry | null>(null);

  const { error: memoriesError } = memoriesQuery;
  useEffect(() => {
    if (!memoriesError) {
      return;
    }
    logger.error('GET /agent/memories/organization failed', memoriesError);
    NotificationsService.getInstance().error(
      translate('notifications.loadFailed'),
    );
  }, [memoriesError, translate]);

  // Cancels a read that started before an archive or promote, and re-reads
  // every cached page and sort.
  const refreshEntries = useRefreshScope(scopeKey);

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
        await refreshEntries();
      } catch (error) {
        logger.error(`Memory ${action} failed`, error);
        notificationsService.error(translate('error.update'));
      } finally {
        setPendingId(null);
      }
    },
    [getMemoriesService, notificationsService, refreshEntries, translate],
  );

  const columns: TableColumn<OrgMemoryEntry>[] = [
    {
      header: translate('columns.memory'),
      key: 'summary',
      sortable: true,
      render: (entry) => entry.summary || entry.content || '-',
    },
    {
      header: translate('columns.author'),
      key: 'user',
      sortable: true,
      render: authorLabel,
    },
    {
      header: translate('columns.scope'),
      key: 'scope',
      sortable: true,
      render: (entry) => (
        <Badge variant="secondary">{scopeLabel(entry.scope)}</Badge>
      ),
    },
    {
      header: translate('columns.status'),
      key: 'promotedSkillId',
      sortable: true,
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
      sortable: true,
      render: (entry) => <TableDateCell value={entry.createdAt} />,
    },
  ];

  const rowSidebar = createSummaryRowSidebar<OrgMemoryEntry>({
    getBadges: (entry) => (
      <>
        <Badge variant="secondary">{scopeLabel(entry.scope)}</Badge>
        {entry.promotedSkillId ? (
          <Badge variant="success">{translate('status.promoted')}</Badge>
        ) : (
          <Badge variant="secondary">{translate('status.active')}</Badge>
        )}
      </>
    ),
    getFacts: (entry) => [
      {
        id: 'author',
        label: translate('columns.author'),
        value: authorLabel(entry),
      },
      {
        id: 'created',
        label: translate('columns.created'),
        value: entry.createdAt ? formatDate(entry.createdAt) : undefined,
      },
    ],
    getId: (entry) => entry.id,
    getTitle: (entry) => entry.summary || entry.content || '-',
    kind: 'record',
    renderExtra: (entry) => (
      <>
        {entry.content && entry.content !== entry.summary ? (
          <p className="whitespace-pre-wrap text-sm text-foreground/80">
            {entry.content}
          </p>
        ) : null}
        {canGovern ? (
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<Pencil className="size-3.5" />}
              isDisabled={pendingId === entry.id}
              label={translate('actions.edit')}
              onClick={() => setEditingEntry(entry)}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
            {!entry.promotedSkillId ? (
              <>
                <Button
                  icon={<Sparkles className="size-3.5" />}
                  isDisabled={pendingId === entry.id}
                  label={translate('actions.promote')}
                  onClick={() => void runAction(entry, 'promote')}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
                <Button
                  icon={<X className="size-3.5" />}
                  isDisabled={pendingId === entry.id}
                  label={translate('actions.reject')}
                  onClick={() => void runAction(entry, 'reject')}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
              </>
            ) : null}
            <Button
              icon={<Archive className="size-3.5" />}
              isDisabled={pendingId === entry.id}
              label={translate('actions.archive')}
              onClick={() => void runAction(entry, 'archive')}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          </div>
        ) : null}
      </>
    ),
  });

  if (!isBillingEnabled) {
    return (
      <EmptyState
        surface="card"
        actions={
          <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
            <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
              {translate('actions.viewSubscription')}
            </Link>
          </Button>
        }
        icon={Lock}
        title={translate('billedTitle')}
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
                  icon: <Pencil />,
                  isDisabled: (entry) => pendingId === entry.id,
                  onClick: (entry) => setEditingEntry(entry),
                  tooltip: translate('actions.edit'),
                },
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
        emptyLabel={translate('empty')}
        error={
          loadError
            ? {
                onRetry: () => {
                  void memoriesQuery.refetch();
                },
                title: translate('error.load'),
              }
            : undefined
        }
        getRowKey={(entry) => entry.id}
        isLoading={entries === null && !loadError}
        items={entries ?? []}
        label={translate('table')}
        rowSidebar={rowSidebar}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
      />
      <EditMemoryDialog
        entry={editingEntry}
        onCorrected={() => refreshEntries()}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setEditingEntry(null);
          }
        }}
      />
      {entries && entries.length > 0 ? (
        <AutoPagination
          showTotal
          totalLabel="memories"
          totals={memoriesPage?.totals ?? EMPTY_PAGE_TOTALS}
        />
      ) : null}
    </div>
  );
}
