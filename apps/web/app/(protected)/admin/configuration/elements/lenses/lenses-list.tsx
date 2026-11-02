import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ModalEnum, PageScope } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IElementLens,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { ElementLens } from '@models/elements/lens.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { LensesService } from '@services/elements/lenses.service';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { useElementRowSidebar } from '@ui/display/element-scope-badge/element-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Pencil, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import { LazyModalLens } from '@/components/lazy/modal/LazyModal';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const LENS_SORT_KEYS = ['label', 'key'];
const EMPTY_LENSS: ElementLens[] = [];

function LensesListContent({
  filters,
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps) {
  const { isSignedIn } = useAuthIdentity();
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const searchParams = useSearchParams();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: LENS_SORT_KEYS,
  });

  const getLensesService = useAuthedService(
    useCallback((token: string) => LensesService.getInstance(token), []),
  );

  const [selectedLens, setSelectedLens] = useState<IElementLens | null>(null);

  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  // Cached per page with the signed-in account in the key: coming back paints
  // the rows and footer it already has while they refresh.
  const lensesQuery = usePagedAuthedQuery({
    enabled: Boolean(isSignedIn),
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
        const data = await service.findAll(query, signal);
        logger.info('GET /lenses success', data);
        return data;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /lenses failed', error);
        }
        throw error;
      }
    },
    queryKey: [
      'admin',
      'lenses',
      {
        adminBrand,
        adminOrg,
        page: currentPage,
        scope,
        search: filters?.search,
        sort,
      },
    ],
    service: (token: string) => LensesService.getInstance(token),
  });
  const lenses = lensesQuery.data?.items ?? EMPTY_LENSS;
  const {
    errorUpdatedAt,
    isError,
    isFetching,
    isLoading,
    refetch: refreshLenses,
  } = lensesQuery;
  const isRefreshing = isFetching && !isLoading;

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load lenses');
    }
  }, [errorUpdatedAt, isError, notificationsService]);

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChangeRef.current?.(isLoading);
  }, [isLoading]);

  useEffect(() => {
    onRefreshingChangeRef.current?.(isRefreshing);
  }, [isRefreshing]);

  const scopeTranslate = useTranslations('ui.elementPlatformFields');
  const columns: TableColumn<ElementLens>[] = [
    {
      header: 'Label',
      key: 'label',
      sortable: true,
      subtext: (lens: ElementLens) => lens.description,
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
      render: (element: ElementLens) => (
        <ElementScopeBadge
          isActive={element.isActive}
          isPlatformDefault={element.isPlatformDefault}
        />
      ),
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <Pencil />,
            onClick: (lens: ElementLens) => openLensModal(ModalEnum.LENS, lens),
            tooltip: 'Edit',
          },
          {
            icon: <Trash2 />,
            onClick: (lens: ElementLens) => {
              setSelectedLens(lens);
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Lens',
                message: `Are you sure you want to delete "${lens.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(lens),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  // Register refresh callback
  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => refreshLenses());
    }
  }, [onRefresh, refreshLenses]);

  const openLensModal = (modalId: ModalEnum, lens?: IElementLens) => {
    setSelectedLens(lens || null);
    openModal(modalId);
  };

  const handleDelete = async (lens: IElementLens) => {
    try {
      const service = await getLensesService();
      await service.delete(lens.id);
      notificationsService.success('Lens deleted');
      setSelectedLens(null);
      refreshLenses();
    } catch (error) {
      logger.error('Failed to delete lens', error);
      notificationsService.error('Failed to delete lens');
      setSelectedLens(null);
    }
  };

  const rowSidebar = useElementRowSidebar<ElementLens>({
    onEdit:
      scope === PageScope.SUPERADMIN
        ? (element) => openLensModal(ModalEnum.LENS, element)
        : undefined,
  });

  return (
    <>
      <AppTable<ElementLens>
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        items={lenses}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No lenses found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalLens
          item={selectedLens}
          onClose={() => setSelectedLens(null)}
          onConfirm={() => {
            setSelectedLens(null);
            refreshLenses();
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="lenses"
          totals={lensesQuery.data?.totals}
        />
      </div>
    </>
  );
}

export default function LensesList(
  props: Parameters<typeof LensesListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <LensesListContent {...props} />
    </Suspense>
  );
}
