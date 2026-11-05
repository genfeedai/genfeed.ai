import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ModalEnum, PageScope } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  IElementMood,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { ElementMood } from '@models/elements/mood.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { MoodsService } from '@services/elements/moods.service';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { useElementRowSidebar } from '@ui/display/element-scope-badge/element-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import { LazyElementCreateModal } from '@/components/lazy/modal/LazyModal';
import { useInlineRecordSave } from '@/hooks/ui/use-inline-record-save/use-inline-record-save';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const EMPTY_MOODS: ElementMood[] = [];

const MOOD_SORT_KEYS = ['label', 'key'];

function MoodsListContent({
  filters,
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps): ReactNode {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();
  const searchParams = useSearchParams();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: MOOD_SORT_KEYS,
  });
  const currentPage = Number(searchParams.get('page')) || 1;

  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  const getMoodsService = useAuthedService(
    useCallback((token: string) => MoodsService.getInstance(token), []),
  );

  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  // Cached per scope and page: coming back paints the rows and footer it
  // already has while they refresh, and another page, search or sort keeps
  // the current rows on screen while it loads.
  const scopeKey = ['admin', 'moods', { adminBrand, adminOrg, scope }] as const;
  const moodsQuery = usePagedAuthedQuery<MoodsService, ElementMood>({
    keepPreviousDataWithin: scopeKey,
    queryFn: async (service, signal) => {
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        search: filters?.search || undefined,
        ...(sort ? { sort } : {}),
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
        logger.info('GET /moods success', data.items);
        return data;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /moods failed', error);
        }
        throw error;
      }
    },
    queryKey: [
      ...scopeKey,
      { page: currentPage, search: filters?.search ?? '', sort: sort ?? null },
    ],
    service: (token: string) => MoodsService.getInstance(token),
  });
  const moods = moodsQuery.data?.items ?? EMPTY_MOODS;
  const {
    errorUpdatedAt,
    isError,
    isFetching,
    isLoading,
    refetch: refreshMoods,
  } = moodsQuery;
  const isRefreshing = isFetching && !isLoading;

  // One toast per failed read, not one per render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load moods');
    }
  }, [errorUpdatedAt, isError, notificationsService]);

  useEffect(() => {
    onLoadingChangeRef.current?.(isLoading);
  }, [isLoading]);

  useEffect(() => {
    onRefreshingChangeRef.current?.(isRefreshing);
  }, [isRefreshing]);

  const scopeTranslate = useTranslations('ui.elementPlatformFields');
  const columns: TableColumn<ElementMood>[] = [
    {
      header: 'Label',
      key: 'label',
      sortable: true,
      subtext: (mood: ElementMood) => mood.description,
    },
    {
      className: 'font-mono text-sm',
      header: 'Key',
      key: 'key',
      sortable: true,
    },
    {
      header: scopeTranslate('scopeHeader'),
      key: 'isPlatformDefault',
      render: (element: ElementMood) => (
        <ElementScopeBadge
          isActive={element.isActive}
          isPlatformDefault={element.isPlatformDefault}
        />
      ),
    },
  ];

  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => refreshMoods());
    }
  }, [onRefresh, refreshMoods]);

  async function handleDelete(mood: IElementMood | null): Promise<void> {
    if (!mood) {
      return;
    }

    try {
      const service = await getMoodsService();
      await service.delete(mood.id);
      notificationsService.success('Mood deleted');
      void refreshMoods();
    } catch (error) {
      logger.error('Failed to delete mood', error);
      notificationsService.error('Failed to delete mood');
    }
  }

  function handleConfirmDelete(mood: ElementMood): void {
    openConfirm({
      confirmLabel: 'Delete',
      isError: true,
      label: 'Delete Mood',
      message: `Are you sure you want to delete "${mood.label}"? This action cannot be undone.`,
      onConfirm: () => handleDelete(mood),
    });
  }

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <Trash2 />,
            onClick: handleConfirmDelete,
            tooltip: 'Delete',
          },
        ]
      : [];

  const saveMood = useInlineRecordSave<Partial<IElementMood>>({
    errorMessage: 'Failed to update mood',
    onSaved: () => {
      void refreshMoods();
    },
    save: async (id, patch) => (await getMoodsService()).patch(id, patch),
  });

  const rowSidebar = useElementRowSidebar<ElementMood>({
    onSave:
      scope === PageScope.SUPERADMIN
        ? (element, patch) => saveMood(element.id, patch)
        : undefined,
  });

  return (
    <>
      <AppTable<ElementMood>
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        items={moods}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No moods found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyElementCreateModal
          modalId={ModalEnum.MOOD}
          onConfirm={() => refreshMoods()}
        />
      )}

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="moods"
          totals={moodsQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
        />
      </div>
    </>
  );
}
export default function MoodsList(
  props: Parameters<typeof MoodsListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <MoodsListContent {...props} />
    </Suspense>
  );
}
