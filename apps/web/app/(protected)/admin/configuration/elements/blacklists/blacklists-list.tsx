import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ModelCategory, PageScope } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  IElementBlacklist,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { ElementBlacklist } from '@models/elements/blacklist.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BlacklistsService } from '@services/elements/blacklists.service';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { buildElementFacts } from '@ui/display/element-scope-badge/element-row-sidebar';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Badge } from '@ui/primitives/badge';
import { Checkbox } from '@ui/primitives/checkbox';
import { Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import { LazyModalBlacklist } from '@/components/lazy/modal/LazyModal';
import { useInlineRecordSave } from '@/hooks/ui/use-inline-record-save/use-inline-record-save';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const EMPTY_BLACKLISTS: ElementBlacklist[] = [];

const BLACKLIST_SORT_KEYS = ['label', 'key', 'category'];

function BlacklistsListContent({
  filters,
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const rowSidebarT = useTranslations('ui.rowSidebar');
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const categoriesT = useTranslations('ui.rowSidebar.categories');
  const categoryOptions = [
    { label: categoriesT('video'), value: ModelCategory.VIDEO },
    { label: categoriesT('image'), value: ModelCategory.IMAGE },
    { label: categoriesT('text'), value: ModelCategory.TEXT },
    { label: categoriesT('music'), value: ModelCategory.MUSIC },
  ];
  const { openConfirm } = useConfirmModal();

  const getBlacklistsService = useAuthedService(
    useCallback((token: string) => BlacklistsService.getInstance(token), []),
  );

  const searchParams = useSearchParams();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: BLACKLIST_SORT_KEYS,
  });

  // Rows with a toggle save in flight.
  const [updatingIds, setUpdatingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const markUpdating = (id: string, isUpdating: boolean) =>
    setUpdatingIds((current) => {
      const next = new Set(current);
      if (isUpdating) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  const scopeTranslate = useTranslations('ui.elementPlatformFields');

  const columns: TableColumn<ElementBlacklist>[] = [
    {
      header: 'Label',
      key: 'label',
      sortable: true,
      subtext: (blacklist: ElementBlacklist) => blacklist.description,
    },
    {
      className: 'font-mono text-sm',
      header: 'Key',
      key: 'key',
      sortable: true,
    },
    {
      header: 'Category',
      key: 'category',
      sortable: true,
      render: (blacklist: IElementBlacklist) => (
        <Badge variant="outline">{blacklist.category ?? 'Undefined'}</Badge>
      ),
    },
    {
      header: scopeTranslate('scopeHeader'),
      key: 'isPlatformDefault',
      render: (blacklist: ElementBlacklist) => (
        <ElementScopeBadge
          isActive={blacklist.isActive}
          isPlatformDefault={blacklist.isPlatformDefault}
        />
      ),
    },
    {
      header: 'Default',
      key: 'isDefault',
      render: (blacklist: ElementBlacklist) => (
        <Checkbox
          name={`isDefault-${blacklist.id}`}
          isChecked={blacklist.isDefault}
          isDisabled={
            !blacklist.isActive ||
            updatingIds.has(blacklist.id) ||
            scope !== PageScope.SUPERADMIN
          }
          onChange={() => handleToggleDefault(blacklist)}
        />
      ),
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <Trash2 />,
            onClick: (blacklist: ElementBlacklist) => {
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Blacklist',
                message: `Are you sure you want to delete "${blacklist.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(blacklist),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  // Cached per scope and page: coming back paints the rows and footer it
  // already has while they refresh, and another page, search or sort keeps
  // the current rows on screen while it loads.
  const scopeKey = [
    'admin',
    'blacklists',
    { adminBrand, adminOrg, scope },
  ] as const;
  const blacklistsQuery = usePagedAuthedQuery<
    BlacklistsService,
    ElementBlacklist
  >({
    keepPreviousDataWithin: scopeKey,
    queryFn: async (service, signal) => {
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        search: filters?.search || undefined,
        ...(sort ? { sort } : {}),
        type: filters?.type || undefined,
      };

      if (scope === PageScope.SUPERADMIN) {
        if (adminOrg) {
          query.organization = adminOrg;
        }
        if (adminBrand) {
          query.brand = adminBrand;
        }
      }

      try {
        const data = await service.findAllPage(query, signal);
        logger.info('GET /blacklists success', data.items);
        return data;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /blacklists failed', error);
        }
        throw error;
      }
    },
    queryKey: [
      ...scopeKey,
      {
        page: currentPage,
        search: filters?.search ?? '',
        type: filters?.type ?? '',
        sort: sort ?? null,
      },
    ],
    service: (token: string) => BlacklistsService.getInstance(token),
  });
  const blacklists = blacklistsQuery.data?.items ?? EMPTY_BLACKLISTS;
  const {
    errorUpdatedAt,
    isError,
    isFetching,
    isLoading,
    refetch: refreshBlacklists,
  } = blacklistsQuery;
  const isRefreshing = isFetching && !isLoading;

  // One toast per failed read, not one per render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load blacklists');
    }
  }, [errorUpdatedAt, isError, notificationsService]);

  useEffect(() => {
    onLoadingChangeRef.current?.(isLoading);
  }, [isLoading]);

  useEffect(() => {
    onRefreshingChangeRef.current?.(isRefreshing);
  }, [isRefreshing]);

  // Register refresh callback
  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => refreshBlacklists());
    }
  }, [onRefresh, refreshBlacklists]);

  const handleToggleDefault = async (blacklist: ElementBlacklist) => {
    markUpdating(blacklist.id, true);
    try {
      const service = await getBlacklistsService();
      await service.patch(blacklist.id, { isDefault: !blacklist.isDefault });
      notificationsService.success('Blacklist updated');
      void refreshBlacklists();
    } catch (error) {
      logger.error('Failed to update blacklist', error);
      notificationsService.error('Failed to update blacklist');
    } finally {
      markUpdating(blacklist.id, false);
    }
  };

  const handleDelete = async (blacklist: ElementBlacklist) => {
    try {
      const service = await getBlacklistsService();
      await service.delete(blacklist.id);
      notificationsService.success('Blacklist deleted');
      void refreshBlacklists();
    } catch (error) {
      logger.error('Failed to delete blacklist', error);
      notificationsService.error('Failed to delete blacklist');
    }
  };

  const saveBlacklist = useInlineRecordSave<Partial<ElementBlacklist>>({
    errorMessage: 'Failed to update blacklist',
    onSaved: () => {
      void refreshBlacklists();
    },
    save: async (id, patch) => (await getBlacklistsService()).patch(id, patch),
  });

  const isEditable = scope === PageScope.SUPERADMIN;

  const rowSidebar = createSummaryRowSidebar<ElementBlacklist>({
    getBadges: (blacklist) => (
      <>
        {blacklist.category ? (
          <Badge variant="outline">{blacklist.category}</Badge>
        ) : null}
        <ElementScopeBadge
          isActive={blacklist.isActive}
          isPlatformDefault={blacklist.isPlatformDefault}
        />
      </>
    ),
    getFacts: (blacklist) => [
      ...buildElementFacts(
        fieldsT,
        blacklist,
        isEditable ? (item, patch) => saveBlacklist(item.id, patch) : undefined,
      ),
      {
        editor: isEditable
          ? {
              ariaLabel: fieldsT('category'),
              kind: 'select',
              onSave: (category) =>
                saveBlacklist(blacklist.id, {
                  category: category as ElementBlacklist['category'],
                }),
              options: categoryOptions,
              value: blacklist.category,
            }
          : undefined,
        id: 'category',
        label: fieldsT('category'),
        value: blacklist.category,
      },
      {
        editor: isEditable
          ? {
              ariaLabel: fieldsT('default'),
              isChecked: blacklist.isDefault === true,
              kind: 'switch',
              onSave: (isDefault) => saveBlacklist(blacklist.id, { isDefault }),
            }
          : undefined,
        id: 'default',
        label: fieldsT('default'),
        value: blacklist.isDefault ? rowSidebarT('yes') : rowSidebarT('no'),
      },
    ],
    getId: (blacklist) => blacklist.id,
    getSubtitle: (blacklist) => blacklist.key,
    getTitle: (blacklist) => blacklist.label,
    kind: 'record',
  });

  return (
    <>
      <AppTable<ElementBlacklist>
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        items={blacklists}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No blacklists found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalBlacklist onConfirm={() => refreshBlacklists()} />
      )}

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="blacklists"
          totals={blacklistsQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
        />
      </div>
    </>
  );
}

export default function BlacklistsList(
  props: Parameters<typeof BlacklistsListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <BlacklistsListContent {...props} />
    </Suspense>
  );
}
