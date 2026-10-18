import { ModalEnum, PageScope } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IElementCamera,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementCamera } from '@models/elements/camera.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CamerasService } from '@services/elements/cameras.service';
import { useQuery } from '@tanstack/react-query';
import { useAdminOrgBrandParams } from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import AppTable from '@ui/display/table/Table';
import { LazyModalCamera } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Pencil, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

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

  const getCamerasService = useAuthedService(
    useCallback((token: string) => CamerasService.getInstance(token), []),
  );

  const [selectedCamera, setSelectedCamera] = useState<IElementCamera | null>(
    null,
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

  const {
    data: cameras = [] as ElementCamera[],
    isLoading,
    isFetching,
    error: camerasError,
    refetch: refreshCameras,
  } = useQuery({
    queryKey: [
      'cameras',
      currentPage,
      scope,
      adminOrg,
      adminBrand,
      filters?.search,
    ],
    queryFn: async () => {
      const service = await getCamerasService();

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
      logger.info('GET /cameras success', data);
      return data;
    },
    enabled: !!isSignedIn,
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (camerasError) {
      logger.error('GET /cameras failed', camerasError);
      notificationsService.error('Failed to load cameras');
    }
  }, [camerasError, notificationsService]);

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
      subtext: (camera: ElementCamera) => camera.description,
    },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
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
            icon: <Pencil />,
            onClick: (camera: ElementCamera) =>
              openCameraModal(ModalEnum.CAMERA, camera),
            tooltip: 'Edit',
          },
          {
            icon: <Trash2 />,
            onClick: (camera: ElementCamera) => {
              setSelectedCamera(camera);
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

  const openCameraModal = (modalId: ModalEnum, camera?: IElementCamera) => {
    setSelectedCamera(camera || null);
    openModal(modalId);
  };

  const handleDelete = async (camera: IElementCamera) => {
    try {
      const service = await getCamerasService();
      await service.delete(camera.id);
      notificationsService.success('Camera deleted');
      setSelectedCamera(null);
      refreshCameras();
    } catch (error) {
      logger.error('Failed to delete camera', error);
      notificationsService.error('Failed to delete camera');
      setSelectedCamera(null);
    }
  };

  return (
    <>
      <AppTable<ElementCamera>
        items={cameras}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No cameras found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalCamera
          item={selectedCamera}
          onClose={() => setSelectedCamera(null)}
          onConfirm={() => {
            setSelectedCamera(null);
            refreshCameras();
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="cameras" />
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
