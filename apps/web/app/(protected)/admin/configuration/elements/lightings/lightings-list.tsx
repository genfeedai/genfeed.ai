import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ModalEnum, PageScope } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  IElementLighting,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { ElementLighting } from '@models/elements/lighting.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { LightingsService } from '@services/elements/lightings.service';
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
  useMemo,
  useRef,
} from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import { LazyElementCreateModal } from '@/components/lazy/modal/LazyModal';
import { useInlineRecordSave } from '@/hooks/ui/use-inline-record-save/use-inline-record-save';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const LIGHTING_SORT_KEYS = ['label', 'key'];
const EMPTY_LIGHTINGS: ElementLighting[] = [];

function LightingsListContent({
  filters,
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps): ReactNode {
  const { isSignedIn } = useAuthIdentity();
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();
  const searchParams = useSearchParams();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: LIGHTING_SORT_KEYS,
  });
  const searchParamsString = searchParams.toString();
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const currentPage = Number(parsedSearchParams.get('page')) || 1;

  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  const getLightingsService = useAuthedService(
    useCallback((token: string) => LightingsService.getInstance(token), []),
  );

  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  // Cached per page with the signed-in account in the key: coming back paints
  // the rows and footer it already has while they refresh.
  const lightingsQuery = usePagedAuthedQuery({
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
        const data = await service.findAllPage(query, signal);
        logger.info('GET /lightings success', data);
        return data;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /lightings failed', error);
        }
        throw error;
      }
    },
    queryKey: [
      'admin',
      'lightings',
      {
        adminBrand,
        adminOrg,
        page: currentPage,
        scope,
        search: filters?.search,
        sort,
      },
    ],
    service: (token: string) => LightingsService.getInstance(token),
  });
  const lightings = lightingsQuery.data?.items ?? EMPTY_LIGHTINGS;
  const {
    errorUpdatedAt,
    isError,
    isFetching,
    isLoading,
    refetch: refreshLightings,
  } = lightingsQuery;
  const isRefreshing = isFetching && !isLoading;

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load lightings');
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
  const columns: TableColumn<ElementLighting>[] = [
    {
      header: 'Label',
      key: 'label',
      sortable: true,
      subtext: (lighting: ElementLighting) => lighting.description,
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
      render: (element: ElementLighting) => (
        <ElementScopeBadge
          isActive={element.isActive}
          isPlatformDefault={element.isPlatformDefault}
        />
      ),
    },
  ];

  // Register refresh callback
  useEffect(() => {
    if (onRefresh) {
      return onRefresh(async () => {
        await refreshLightings();
      });
    }
  }, [onRefresh, refreshLightings]);

  async function handleDelete(
    lighting: IElementLighting | null,
  ): Promise<void> {
    if (!lighting) {
      return;
    }

    try {
      const service = await getLightingsService();
      await service.delete(lighting.id);
      notificationsService.success('Lighting deleted');
      refreshLightings();
    } catch (error) {
      logger.error('Failed to delete lighting', error);
      notificationsService.error('Failed to delete lighting');
    }
  }

  function handleConfirmDelete(lighting: ElementLighting): void {
    openConfirm({
      confirmLabel: 'Delete',
      isError: true,
      label: 'Delete Lighting',
      message: `Are you sure you want to delete "${lighting.label}"? This action cannot be undone.`,
      onConfirm: () => handleDelete(lighting),
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

  const saveLighting = useInlineRecordSave<Partial<IElementLighting>>({
    errorMessage: 'Failed to update lighting',
    onSaved: refreshLightings,
    save: async (id, patch) => (await getLightingsService()).patch(id, patch),
  });

  const rowSidebar = useElementRowSidebar<ElementLighting>({
    onSave:
      scope === PageScope.SUPERADMIN
        ? (element, patch) => saveLighting(element.id, patch)
        : undefined,
  });

  return (
    <>
      <AppTable<ElementLighting>
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        items={lightings}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No lightings found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyElementCreateModal
          modalId={ModalEnum.LIGHTING}
          onConfirm={() => refreshLightings()}
        />
      )}

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="lightings"
          totals={lightingsQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
        />
      </div>
    </>
  );
}
export default function LightingsList(
  props: Parameters<typeof LightingsListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <LightingsListContent {...props} />
    </Suspense>
  );
}
