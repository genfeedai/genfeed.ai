import { ModalEnum, PageScope } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IElementScene,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementScene } from '@models/elements/scene.model';
import type {
  SceneFetchStatus as FetchStatus,
  ScenesAction,
  ScenesState,
} from '@props/admin/scenes.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ScenesService } from '@services/elements/scenes.service';
import { useAdminOrgBrandParams } from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import AppTable from '@ui/display/table/Table';
import { LazyModalScene } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Pencil, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from 'react';

function scenesReducer(state: ScenesState, action: ScenesAction): ScenesState {
  switch (action.type) {
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
  filters,
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps): ReactNode {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;

  const [state, dispatch] = useReducer(scenesReducer, undefined, () => ({
    scenes: [],
    fetchStatus: 'loading' as FetchStatus,
    selectedScene: null,
  }));

  const { scenes, fetchStatus, selectedScene } = state;
  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  // Derive isLoading from fetchStatus instead of storing it separately
  const isLoading = fetchStatus === 'loading';

  const getScenesService = useAuthedService(
    useCallback((token: string) => ScenesService.getInstance(token), []),
  );

  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  const scopeTranslate = useTranslations('ui.elementPlatformFields');
  const columns: TableColumn<ElementScene>[] = [
    {
      header: 'Label',
      key: 'label',
      subtext: (scene: ElementScene) => scene.description,
    },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: scopeTranslate('scopeHeader'),
      key: 'isPlatformDefault',
      render: (element: ElementScene) => (
        <ElementScopeBadge
          isActive={element.isActive}
          isPlatformDefault={element.isPlatformDefault}
        />
      ),
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
        dispatch({ type: 'FETCH_SUCCESS', scenes: data });
        logger.info('GET /scenes success', data);
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
      filters?.search,
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

  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => findAllScenes(true));
    }
  }, [onRefresh, findAllScenes]);

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
            icon: <Pencil />,
            onClick: (scene: ElementScene) =>
              openSceneModal(ModalEnum.SCENE, scene),
            tooltip: 'Edit',
          },
          {
            icon: <Trash2 />,
            onClick: handleConfirmDelete,
            tooltip: 'Delete',
          },
        ]
      : [];

  return (
    <>
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
