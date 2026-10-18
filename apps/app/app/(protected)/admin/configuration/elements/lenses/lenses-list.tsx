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
import type { ElementLens } from '@models/elements/lens.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { LensesService } from '@services/elements/lenses.service';
import { useQuery } from '@tanstack/react-query';
import { useAdminOrgBrandParams } from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import AppTable from '@ui/display/table/Table';
import { LazyModalLens } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Pencil, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

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

  const {
    data: lenses = [] as ElementLens[],
    isLoading,
    isFetching,
    error: lensesError,
    refetch: refreshLenses,
  } = useQuery({
    queryKey: [
      'lenses',
      currentPage,
      scope,
      adminOrg,
      adminBrand,
      filters?.search,
    ],
    queryFn: async () => {
      const service = await getLensesService();

      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        search: filters?.search || undefined,
      };

      if (scope === PageScope.SUPERADMIN) {
        if (adminOrg) {
          query.organization = adminOrg;
        }
        if (adminBrand) {
          query.brand = adminBrand;
        }
      }

      const data = await service.findAll(query);
      logger.info('GET /lenses success', data);
      return data;
    },
    enabled: !!isSignedIn,
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (lensesError) {
      logger.error('GET /lenses failed', lensesError);
      notificationsService.error('Failed to load lenses');
    }
  }, [lensesError, notificationsService]);

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
      subtext: (lens: ElementLens) => lens.description,
    },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
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

  return (
    <>
      <AppTable<ElementLens>
        items={lenses}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
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
        <AutoPagination showTotal totalLabel="lenses" />
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
