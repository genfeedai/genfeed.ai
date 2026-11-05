import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ModalEnum, PageScope } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  IElementScene,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { ElementScene } from '@models/elements/scene.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ScenesService } from '@services/elements/scenes.service';
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

const EMPTY_SCENES: ElementScene[] = [];

const SCENE_SORT_KEYS = ['label', 'key'];

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
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: SCENE_SORT_KEYS,
  });
  const currentPage = Number(searchParams.get('page')) || 1;

  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  const getScenesService = useAuthedService(
    useCallback((token: string) => ScenesService.getInstance(token), []),
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
  const scopeKey = [
    'admin',
    'scenes',
    { adminBrand, adminOrg, scope },
  ] as const;
  const scenesQuery = usePagedAuthedQuery<ScenesService, ElementScene>({
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

      const data = await service.findAllPage(query, signal);
      logger.info('GET /scenes success', data.items);
      return data;
    },
    queryKey: [
      ...scopeKey,
      { page: currentPage, search: filters?.search ?? '', sort: sort ?? null },
    ],
    service: (token: string) => ScenesService.getInstance(token),
  });
  const scenes = scenesQuery.data?.items ?? EMPTY_SCENES;
  const {
    error: loadError,
    isFetching,
    isLoading,
    refetch: refreshScenes,
  } = scenesQuery;
  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (!loadError) {
      return;
    }
    logger.error('GET /scenes failed', loadError);
    NotificationsService.getInstance().error('Failed to load scenes');
  }, [loadError]);

  useEffect(() => {
    onLoadingChangeRef.current?.(isLoading);
  }, [isLoading]);

  useEffect(() => {
    onRefreshingChangeRef.current?.(isRefreshing);
  }, [isRefreshing]);

  const scopeTranslate = useTranslations('ui.elementPlatformFields');
  const columns: TableColumn<ElementScene>[] = [
    {
      header: 'Label',
      key: 'label',
      sortable: true,
      subtext: (scene: ElementScene) => scene.description,
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
      render: (element: ElementScene) => (
        <ElementScopeBadge
          isActive={element.isActive}
          isPlatformDefault={element.isPlatformDefault}
        />
      ),
    },
  ];

  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => refreshScenes());
    }
  }, [onRefresh, refreshScenes]);

  async function handleDelete(scene: IElementScene | null): Promise<void> {
    if (!scene) {
      return;
    }

    try {
      const service = await getScenesService();
      await service.delete(scene.id);
      notificationsService.success('Scene deleted');
      void refreshScenes();
    } catch (error) {
      logger.error('Failed to delete scene', error);
      notificationsService.error('Failed to delete scene');
    }
  }

  function handleConfirmDelete(scene: ElementScene): void {
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
            icon: <Trash2 />,
            onClick: handleConfirmDelete,
            tooltip: 'Delete',
          },
        ]
      : [];

  const saveScene = useInlineRecordSave<Partial<IElementScene>>({
    errorMessage: 'Failed to update scene',
    onSaved: () => {
      void refreshScenes();
    },
    save: async (id, patch) => (await getScenesService()).patch(id, patch),
  });

  const rowSidebar = useElementRowSidebar<ElementScene>({
    onSave:
      scope === PageScope.SUPERADMIN
        ? (element, patch) => saveScene(element.id, patch)
        : undefined,
  });

  return (
    <>
      <AppTable<ElementScene>
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        items={scenes}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No scenes found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyElementCreateModal
          modalId={ModalEnum.SCENE}
          onConfirm={() => {
            void refreshScenes();
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="scenes"
          totals={scenesQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
        />
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
