import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ModalEnum, PageScope } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  IElementCameraMovement,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { ElementCameraMovement } from '@models/elements/camera-movement.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CameraMovementsService } from '@services/elements/camera-movements.service';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { useElementRowSidebar } from '@ui/display/element-scope-badge/element-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import { LazyElementCreateModal } from '@/components/lazy/modal/LazyModal';
import { useInlineRecordSave } from '@/hooks/ui/use-inline-record-save/use-inline-record-save';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const EMPTY_CAMERA_MOVEMENTS: ElementCameraMovement[] = [];

const CAMERA_MOVEMENT_SORT_KEYS = ['label', 'key'];

function CameraMovementsListContent({
  filters,
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const searchParams = useSearchParams();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: CAMERA_MOVEMENT_SORT_KEYS,
  });

  const getCameraMovementsService = useAuthedService(
    useCallback(
      (token: string) => CameraMovementsService.getInstance(token),
      [],
    ),
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

  const scopeTranslate = useTranslations('ui.elementPlatformFields');
  const columns: TableColumn<ElementCameraMovement>[] = [
    {
      header: 'Label',
      key: 'label',
      sortable: true,
      subtext: (movement: ElementCameraMovement) => movement.description,
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
      render: (element: ElementCameraMovement) => (
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
            onClick: (movement: ElementCameraMovement) => {
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Camera Movement',
                message: `Are you sure you want to delete "${movement.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(movement),
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
    'camera-movements',
    { adminBrand, adminOrg, scope },
  ] as const;
  const cameraMovementsQuery = usePagedAuthedQuery<
    CameraMovementsService,
    ElementCameraMovement
  >({
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
        logger.info('GET /camera-movements success', data.items);
        return data;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /camera-movements failed', error);
        }
        throw error;
      }
    },
    queryKey: [
      ...scopeKey,
      { page: currentPage, search: filters?.search ?? '', sort: sort ?? null },
    ],
    service: (token: string) => CameraMovementsService.getInstance(token),
  });
  const cameraMovements =
    cameraMovementsQuery.data?.items ?? EMPTY_CAMERA_MOVEMENTS;
  const {
    errorUpdatedAt,
    isError,
    isFetching,
    isLoading,
    refetch: refreshCameraMovements,
  } = cameraMovementsQuery;
  const isRefreshing = isFetching && !isLoading;

  // One toast per failed read, not one per render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load camera movements');
    }
  }, [errorUpdatedAt, isError, notificationsService]);

  useEffect(() => {
    onLoadingChangeRef.current?.(isLoading);
  }, [isLoading]);

  useEffect(() => {
    onRefreshingChangeRef.current?.(isRefreshing);
  }, [isRefreshing]);

  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => refreshCameraMovements());
    }
  }, [onRefresh, refreshCameraMovements]);

  const handleDelete = async (movement: IElementCameraMovement) => {
    try {
      const service = await getCameraMovementsService();
      await service.delete(movement.id);
      notificationsService.success('Camera movement deleted');
      void refreshCameraMovements();
    } catch (error) {
      logger.error('Failed to delete camera movement', error);
      notificationsService.error('Failed to delete camera movement');
    }
  };

  const saveCameraMovement = useInlineRecordSave<
    Partial<IElementCameraMovement>
  >({
    errorMessage: 'Failed to update camera movement',
    onSaved: () => {
      void refreshCameraMovements();
    },
    save: async (id, patch) =>
      (await getCameraMovementsService()).patch(id, patch),
  });

  const rowSidebar = useElementRowSidebar<ElementCameraMovement>({
    onSave:
      scope === PageScope.SUPERADMIN
        ? (element, patch) => saveCameraMovement(element.id, patch)
        : undefined,
  });

  return (
    <>
      <AppTable<ElementCameraMovement>
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        items={cameraMovements}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No camera movements found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyElementCreateModal
          modalId={ModalEnum.CAMERA_MOVEMENT}
          onConfirm={() => refreshCameraMovements()}
        />
      )}

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="camera movements"
          totals={cameraMovementsQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
        />
      </div>
    </>
  );
}

export default function CameraMovementsList(
  props: Parameters<typeof CameraMovementsListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <CameraMovementsListContent {...props} />
    </Suspense>
  );
}
