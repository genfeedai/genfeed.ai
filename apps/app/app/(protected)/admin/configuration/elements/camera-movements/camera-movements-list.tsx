import { ModalEnum, PageScope } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IElementCameraMovement,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementCameraMovement } from '@models/elements/camera-movement.model';
import type {
  CameraMovementsAction,
  CameraMovementsState,
} from '@props/admin/camera-movements.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CameraMovementsService } from '@services/elements/camera-movements.service';
import { useAdminOrgBrandParams } from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { useElementRowSidebar } from '@ui/display/element-scope-badge/element-row-sidebar';
import AppTable from '@ui/display/table/Table';
import { LazyModalCameraMovement } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Pencil, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useReducer, useRef } from 'react';

function cameraMovementsReducer(
  state: CameraMovementsState,
  action: CameraMovementsAction,
): CameraMovementsState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_CAMERA_MOVEMENTS':
      return { ...state, cameraMovements: action.payload };
    case 'SET_SELECTED':
      return { ...state, selectedCameraMovement: action.payload };
    case 'FETCH_START':
      return { ...state, isLoading: !action.payload.isRefresh };
    case 'FETCH_DONE':
      return { ...state, isLoading: false, cameraMovements: action.payload };
    case 'FETCH_ERROR':
      return { ...state, isLoading: false };
    default:
      return state;
  }
}

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

  const getCameraMovementsService = useAuthedService(
    useCallback(
      (token: string) => CameraMovementsService.getInstance(token),
      [],
    ),
  );

  const [state, dispatch] = useReducer(
    cameraMovementsReducer,
    undefined,
    () => ({
      cameraMovements: [],
      isLoading: true,
      selectedCameraMovement: null,
    }),
  );

  const { cameraMovements, isLoading, selectedCameraMovement } = state;

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
      subtext: (movement: ElementCameraMovement) => movement.description,
    },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
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
            icon: <Pencil />,
            onClick: (movement: ElementCameraMovement) =>
              openCameraMovementModal(ModalEnum.CAMERA_MOVEMENT, movement),
            tooltip: 'Edit',
          },
          {
            icon: <Trash2 />,
            onClick: (movement: ElementCameraMovement) => {
              dispatch({ type: 'SET_SELECTED', payload: movement });
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

  const findAllCameraMovements = useCallback(
    async (isRefresh = false) => {
      const newIsRefreshing = isRefresh;
      const newIsLoading = !isRefresh;

      dispatch({ type: 'FETCH_START', payload: { isRefresh } });

      // Notify parent of state changes
      onRefreshingChangeRef.current?.(newIsRefreshing);
      onLoadingChangeRef.current?.(newIsLoading);

      try {
        const service = await getCameraMovementsService();

        // Build API query
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
        dispatch({ type: 'FETCH_DONE', payload: data });

        logger.info('GET /camera-movements success', data);
      } catch (error) {
        logger.error('GET /camera-movements failed', error);
        notificationsService.error('Failed to load camera movements');
        dispatch({ type: 'FETCH_ERROR' });
      } finally {
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      filters?.search,
      getCameraMovementsService,
      notificationsService.error,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  // Fetch data on mount and when page changes
  useEffect(() => {
    findAllCameraMovements();
  }, [findAllCameraMovements]);

  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => findAllCameraMovements(true));
    }
  }, [onRefresh, findAllCameraMovements]);

  const openCameraMovementModal = (
    modalId: ModalEnum,
    movement?: IElementCameraMovement,
  ) => {
    dispatch({ type: 'SET_SELECTED', payload: movement || null });
    openModal(modalId);
  };

  const handleDelete = async (movement: IElementCameraMovement) => {
    try {
      const service = await getCameraMovementsService();
      await service.delete(movement.id);
      notificationsService.success('Camera movement deleted');
      dispatch({ type: 'SET_SELECTED', payload: null });
      findAllCameraMovements(true);
    } catch (error) {
      logger.error('Failed to delete camera movement', error);
      notificationsService.error('Failed to delete camera movement');
      dispatch({ type: 'SET_SELECTED', payload: null });
    }
  };

  const rowSidebar = useElementRowSidebar<ElementCameraMovement>({
    onEdit:
      scope === PageScope.SUPERADMIN
        ? (element) =>
            openCameraMovementModal(ModalEnum.CAMERA_MOVEMENT, element)
        : undefined,
  });

  return (
    <>
      <AppTable<ElementCameraMovement>
        items={cameraMovements}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No camera movements found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalCameraMovement
          item={selectedCameraMovement}
          onClose={() => dispatch({ type: 'SET_SELECTED', payload: null })}
          onConfirm={() => {
            dispatch({ type: 'SET_SELECTED', payload: null });
            findAllCameraMovements(true);
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="camera movements" />
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
