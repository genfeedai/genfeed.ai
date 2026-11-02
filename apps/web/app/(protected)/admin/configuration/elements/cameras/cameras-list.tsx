import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { PageScope } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  IElementCamera,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { ElementCamera } from '@models/elements/camera.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CamerasService } from '@services/elements/cameras.service';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { useElementRowSidebar } from '@ui/display/element-scope-badge/element-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import { LazyModalCamera } from '@/components/lazy/modal/LazyModal';
import { useInlineRecordSave } from '@/hooks/ui/use-inline-record-save/use-inline-record-save';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const CAMERA_SORT_KEYS = ['label', 'key'];
const EMPTY_CAMERAS: ElementCamera[] = [];

function CamerasListContent({
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
    allowedKeys: CAMERA_SORT_KEYS,
  });

  const getCamerasService = useAuthedService(
    useCallback((token: string) => CamerasService.getInstance(token), []),
  );

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
  const camerasQuery = usePagedAuthedQuery({
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
        logger.info('GET /cameras success', data);
        return data;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /cameras failed', error);
        }
        throw error;
      }
    },
    queryKey: [
      'admin',
      'cameras',
      {
        adminBrand,
        adminOrg,
        page: currentPage,
        scope,
        search: filters?.search,
        sort,
      },
    ],
    service: (token: string) => CamerasService.getInstance(token),
  });
  const cameras = camerasQuery.data?.items ?? EMPTY_CAMERAS;
  const {
    errorUpdatedAt,
    isError,
    isFetching,
    isLoading,
    refetch: refreshCameras,
  } = camerasQuery;
  const isRefreshing = isFetching && !isLoading;

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load cameras');
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
  const columns: TableColumn<ElementCamera>[] = [
    {
      header: 'Label',
      key: 'label',
      sortable: true,
      subtext: (camera: ElementCamera) => camera.description,
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
      render: (element: ElementCamera) => (
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
            icon: <Trash2 />,
            onClick: (camera: ElementCamera) => {
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Camera',
                message: `Are you sure you want to delete "${camera.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(camera),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  // Register refresh callback
  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => refreshCameras());
    }
  }, [onRefresh, refreshCameras]);

  const handleDelete = async (camera: IElementCamera) => {
    try {
      const service = await getCamerasService();
      await service.delete(camera.id);
      notificationsService.success('Camera deleted');
      refreshCameras();
    } catch (error) {
      logger.error('Failed to delete camera', error);
      notificationsService.error('Failed to delete camera');
    }
  };

  const saveCamera = useInlineRecordSave<Partial<IElementCamera>>({
    errorMessage: 'Failed to update camera',
    onSaved: refreshCameras,
    save: async (id, patch) => (await getCamerasService()).patch(id, patch),
  });

  const rowSidebar = useElementRowSidebar<ElementCamera>({
    onSave:
      scope === PageScope.SUPERADMIN
        ? (camera, patch) => saveCamera(camera.id, patch)
        : undefined,
  });

  return (
    <>
      <AppTable<ElementCamera>
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        items={cameras}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No cameras found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalCamera onConfirm={() => refreshCameras()} />
      )}

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="cameras"
          totals={camerasQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
        />
      </div>
    </>
  );
}

export default function CamerasList(
  props: Parameters<typeof CamerasListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <CamerasListContent {...props} />
    </Suspense>
  );
}
