'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum, PageScope } from '@genfeedai/enums';
import type {
  IElementCameraMovement,
  IQueryParams,
} from '@genfeedai/interfaces';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementCameraMovement } from '@models/elements/camera-movement.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CameraMovementsService } from '@services/elements/camera-movements.service';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import { LazyModalCameraMovement } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

type CameraMovementsState = {
  cameraMovements: ElementCameraMovement[];
  isLoading: boolean;
  selectedCameraMovement: IElementCameraMovement | null;
  adminOrg: string;
  adminBrand: string;
};

type CameraMovementsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_CAMERA_MOVEMENTS'; payload: ElementCameraMovement[] }
  | { type: 'SET_SELECTED'; payload: IElementCameraMovement | null }
  | { type: 'SET_ADMIN_ORG'; payload: string }
  | { type: 'SET_ADMIN_BRAND'; payload: string }
  | { type: 'SET_ADMIN_ORG_AND_CLEAR_BRAND'; payload: string }
  | { type: 'FETCH_START'; payload: { isRefresh: boolean } }
  | { type: 'FETCH_DONE'; payload: ElementCameraMovement[] }
  | { type: 'FETCH_ERROR' };

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
    case 'SET_ADMIN_ORG':
      return { ...state, adminOrg: action.payload };
    case 'SET_ADMIN_BRAND':
      return { ...state, adminBrand: action.payload };
    case 'SET_ADMIN_ORG_AND_CLEAR_BRAND':
      return { ...state, adminOrg: action.payload, adminBrand: '' };
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
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

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
      adminOrg: parsedSearchParams.get('organization') || '',
      adminBrand: parsedSearchParams.get('brand') || '',
    }),
  );

  const {
    cameraMovements,
    isLoading,
    selectedCameraMovement,
    adminOrg,
    adminBrand,
  } = state;

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      dispatch({ type: 'SET_ADMIN_ORG_AND_CLEAR_BRAND', payload: orgId });
      const params = new URLSearchParams(searchParamsString);
      if (orgId) {
        params.set('organization', orgId);
      } else {
        params.delete('organization');
      }
      params.delete('brand');
      params.delete('page');
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  const handleAdminBrandChange = useCallback(
    (brandId: string) => {
      dispatch({ type: 'SET_ADMIN_BRAND', payload: brandId });
      const params = new URLSearchParams(searchParamsString);
      if (brandId) {
        params.set('brand', brandId);
      } else {
        params.delete('brand');
      }
      params.delete('page');
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  const columns: TableColumn<ElementCameraMovement>[] = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Description',
      key: 'description',
      render: (movement: ElementCameraMovement) => movement.description || '-',
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (movement: ElementCameraMovement) =>
              openCameraMovementModal(ModalEnum.CAMERA_MOVEMENT, movement),
            tooltip: 'Edit',
          },
          {
            icon: <HiTrash />,
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

        if (isRefresh) {
          notificationsService.success('Camera movements refreshed');
        }

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
      getCameraMovementsService,
      notificationsService.error,
      notificationsService.success,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  // Fetch data on mount and when page changes
  useEffect(() => {
    findAllCameraMovements();
  }, [findAllCameraMovements]);

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

  return (
    <>
      {scope === PageScope.SUPERADMIN && (
        <div className="mb-4">
          <AdminOrgBrandFilter
            organization={adminOrg}
            brand={adminBrand}
            onOrganizationChange={handleAdminOrgChange}
            onBrandChange={handleAdminBrandChange}
          />
        </div>
      )}

      <AppTable<ElementCameraMovement>
        items={cameraMovements}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
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
