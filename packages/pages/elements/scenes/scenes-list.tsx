'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum } from '@genfeedai/enums';
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
import { PageScope } from '@ui-constants/misc.constant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

export default function ScenesList({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
}: IElementContentProps): ReactNode {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const currentPage = Number(searchParams?.get('page')) || 1;

  // Admin org/brand filter state (superadmin only)
  const [adminOrg, setAdminOrg] = useState(
    () => parsedSearchParams.get('organization') || '',
  );
  const [adminBrand, setAdminBrand] = useState(
    () => parsedSearchParams.get('brand') || '',
  );

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      setAdminOrg(orgId);
      setAdminBrand('');
      const params = new URLSearchParams(searchParamsString);
      if (orgId) {
        params.set('organization', orgId);
      } else {
        params.delete('organization');
      }
      params.delete('brand');
      params.delete('page');
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  const handleAdminBrandChange = useCallback(
    (brandId: string) => {
      setAdminBrand(brandId);
      const params = new URLSearchParams(searchParamsString);
      if (brandId) {
        params.set('brand', brandId);
      } else {
        params.delete('brand');
      }
      params.delete('page');
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  const getScenesService = useAuthedService(
    useCallback((token: string) => ScenesService.getInstance(token), []),
  );

  const [scenes, setScenes] = useState<ElementScene[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedScene, setSelectedScene] = useState<IElementScene | null>(
    null,
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
      setIsLoading(!isRefreshRequest);
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
        setScenes(data);
        logger.info('GET /scenes success', data);

        if (isRefreshRequest) {
          notificationsService.success('Scenes refreshed');
        }
      } catch (error) {
        logger.error('GET /scenes failed', error);
        notificationsService.error('Failed to load scenes');
      } finally {
        setIsLoading(false);
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      getScenesService,
      notificationsService,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  useEffect(() => {
    findAllScenes();
  }, [findAllScenes]);

  function openSceneModal(modalId: ModalEnum, scene?: IElementScene): void {
    setSelectedScene(scene ?? null);
    openModal(modalId);
  }

  async function handleDelete(): Promise<void> {
    if (!selectedScene) {
      return;
    }

    try {
      const service = await getScenesService();
      await service.delete(selectedScene.id);
      notificationsService.success('Scene deleted');
      setSelectedScene(null);
      findAllScenes(true);
    } catch (error) {
      logger.error('Failed to delete scene', error);
      notificationsService.error('Failed to delete scene');
      setSelectedScene(null);
    }
  }

  function handleConfirmDelete(scene: ElementScene): void {
    setSelectedScene(scene);
    openConfirm({
      confirmLabel: 'Delete',
      isError: true,
      label: 'Delete Scene',
      message: `Are you sure you want to delete "${scene.label}"? This action cannot be undone.`,
      onConfirm: handleDelete,
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
          onClose={() => setSelectedScene(null)}
          onConfirm={() => {
            setSelectedScene(null);
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
