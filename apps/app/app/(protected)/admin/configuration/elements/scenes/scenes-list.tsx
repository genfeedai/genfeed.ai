'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum, PageScope } from '@genfeedai/enums';
import type { IElementScene, IQueryParams } from '@genfeedai/interfaces';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementScene } from '@models/elements/scene.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ScenesService } from '@services/elements/scenes.service';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import { LazyModalScene } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

type FetchStatus = 'loading' | 'refreshing' | 'idle';

type ScenesState = {
  adminOrg: string;
  adminBrand: string;
  scenes: ElementScene[];
  fetchStatus: FetchStatus;
  selectedScene: IElementScene | null;
};

type ScenesAction =
  | { type: 'SET_ADMIN_ORG'; payload: string }
  | { type: 'SET_ADMIN_BRAND'; payload: string }
  | { type: 'FETCH_START'; isRefresh: boolean }
  | { type: 'FETCH_SUCCESS'; scenes: ElementScene[] }
  | { type: 'FETCH_DONE' }
  | { type: 'SET_SELECTED_SCENE'; scene: IElementScene | null };

function scenesReducer(state: ScenesState, action: ScenesAction): ScenesState {
  switch (action.type) {
    case 'SET_ADMIN_ORG':
      return { ...state, adminOrg: action.payload, adminBrand: '' };
    case 'SET_ADMIN_BRAND':
      return { ...state, adminBrand: action.payload };
    case 'FETCH_START':
      return {
        ...state,
        fetchStatus: action.isRefresh ? 'refreshing' : 'loading',
      };
    case 'FETCH_SUCCESS':
      return { ...state, scenes: action.scenes };
    case 'FETCH_DONE':
      return { ...state, fetchStatus: 'idle' };
    case 'SET_SELECTED_SCENE':
      return { ...state, selectedScene: action.scene };
    default:
      return state;
  }
}

function ScenesListContent({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
}: IElementContentProps): ReactNode {
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
  const currentPage = Number(searchParams.get('page')) || 1;

  const [state, dispatch] = useReducer(scenesReducer, undefined, () => ({
    adminOrg: parsedSearchParams.get('organization') || '',
    adminBrand: parsedSearchParams.get('brand') || '',
    scenes: [],
    fetchStatus: 'loading' as FetchStatus,
    selectedScene: null,
  }));

  const { adminOrg, adminBrand, scenes, fetchStatus, selectedScene } = state;

  // Derive isLoading from fetchStatus instead of storing it separately
  const isLoading = fetchStatus === 'loading';

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      dispatch({ type: 'SET_ADMIN_ORG', payload: orgId });
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

  const getScenesService = useAuthedService(
    useCallback((token: string) => ScenesService.getInstance(token), []),
  );

  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  const columns: TableColumn<ElementScene>[] = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Description',
      key: 'description',
      render: (scene: ElementScene) => scene.description || '-',
    },
  ];

  const findAllScenes = useCallback(
    async (isRefreshRequest = false) => {
      dispatch({ type: 'FETCH_START', isRefresh: isRefreshRequest });
      onRefreshingChangeRef.current?.(isRefreshRequest);
      onLoadingChangeRef.current?.(!isRefreshRequest);

      try {
        const service = await getScenesService();
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
        dispatch({ type: 'FETCH_SUCCESS', scenes: data });
        logger.info('GET /scenes success', data);

        if (isRefreshRequest) {
          notificationsService.success('Scenes refreshed');
        }
      } catch (error) {
        logger.error('GET /scenes failed', error);
        notificationsService.error('Failed to load scenes');
      } finally {
        dispatch({ type: 'FETCH_DONE' });
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      getScenesService,
      notificationsService.error,
      notificationsService.success,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  useEffect(() => {
    findAllScenes();
  }, [findAllScenes]);

  function openSceneModal(modalId: ModalEnum, scene?: IElementScene): void {
    dispatch({ type: 'SET_SELECTED_SCENE', scene: scene ?? null });
    openModal(modalId);
  }

  async function handleDelete(scene: IElementScene | null): Promise<void> {
    if (!scene) {
      return;
    }

    try {
      const service = await getScenesService();
      await service.delete(scene.id);
      notificationsService.success('Scene deleted');
      dispatch({ type: 'SET_SELECTED_SCENE', scene: null });
      findAllScenes(true);
    } catch (error) {
      logger.error('Failed to delete scene', error);
      notificationsService.error('Failed to delete scene');
      dispatch({ type: 'SET_SELECTED_SCENE', scene: null });
    }
  }

  function handleConfirmDelete(scene: ElementScene): void {
    dispatch({ type: 'SET_SELECTED_SCENE', scene });
    openConfirm({
      confirmLabel: 'Delete',
      isError: true,
      label: 'Delete Scene',
      message: `Are you sure you want to delete "${scene.label}"? This action cannot be undone.`,
      onConfirm: () => handleDelete(scene),
    });
  }

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (scene: ElementScene) =>
              openSceneModal(ModalEnum.SCENE, scene),
            tooltip: 'Edit',
          },
          {
            icon: <HiTrash />,
            onClick: handleConfirmDelete,
            tooltip: 'Delete',
          },
        ]
      : [];

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

      <AppTable<ElementScene>
        items={scenes}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No scenes found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalScene
          item={selectedScene}
          onClose={() => dispatch({ type: 'SET_SELECTED_SCENE', scene: null })}
          onConfirm={() => {
            dispatch({ type: 'SET_SELECTED_SCENE', scene: null });
            findAllScenes(true);
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="scenes" />
      </div>
    </>
  );
}
export default function ScenesList(
  props: Parameters<typeof ScenesListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <ScenesListContent {...props} />
    </Suspense>
  );
}
