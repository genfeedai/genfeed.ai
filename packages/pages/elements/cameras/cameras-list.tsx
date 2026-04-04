'use client';

import { useAuth } from '@clerk/nextjs';
import type { IElementCamera, IQueryParams } from '@cloud/interfaces';
import type { IElementContentProps } from '@cloud/interfaces/ui/elements-content.interface';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum } from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { ElementCamera } from '@models/elements/camera.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CamerasService } from '@services/elements/cameras.service';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import { LazyModalCamera } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { PageScope } from '@ui-constants/misc.constant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

export default function CamerasList({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps) {
  const { isSignedIn } = useAuth();
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

  const getCamerasService = useAuthedService(
    useCallback((token: string) => CamerasService.getInstance(token), []),
  );

  const [selectedCamera, setSelectedCamera] = useState<IElementCamera | null>(
    null,
  );

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

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams?.get('page')) || 1;

  // Load cameras using useResource (handles AbortController cleanup properly)
  const {
    data: cameras,
    isLoading,
    isRefreshing,
    refresh: refreshCameras,
  } = useResource(
    async () => {
      const service = await getCamerasService();

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
      logger.info('GET /cameras success', data);
      return data;
    },
    {
      defaultValue: [] as ElementCamera[],
      dependencies: [currentPage, scope, adminOrg, adminBrand],
      enabled: !!isSignedIn,
      onError: (error) => {
        logger.error('GET /cameras failed', error);
        notificationsService.error('Failed to load cameras');
      },
    },
  );

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChangeRef.current?.(isLoading);
  }, [isLoading]);

  useEffect(() => {
    onRefreshingChangeRef.current?.(isRefreshing);
  }, [isRefreshing]);

  const columns: TableColumn<ElementCamera>[] = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Description',
      key: 'description',
      render: (camera: ElementCamera) => camera.description || '-',
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (camera: ElementCamera) =>
              openCameraModal(ModalEnum.CAMERA, camera),
            tooltip: 'Edit',
          },
          {
            icon: <HiTrash />,
            onClick: (camera: ElementCamera) => {
              setSelectedCamera(camera);
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Camera',
                message: `Are you sure you want to delete "${camera.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(),
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

  const handleDelete = async () => {
    if (!selectedCamera) {
      return;
    }

    try {
      const service = await getCamerasService();
      await service.delete(selectedCamera.id);
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
