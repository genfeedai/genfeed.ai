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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

export default function CameraMovementsList({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
}: IElementContentProps) {
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

  const getCameraMovementsService = useAuthedService(
    useCallback(
      (token: string) => CameraMovementsService.getInstance(token),
      [],
    ),
  );

  const [cameraMovements, setCameraMovements] = useState<
    ElementCameraMovement[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);

  const [selectedCameraMovement, setSelectedCameraMovement] =
    useState<IElementCameraMovement | null>(null);

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
              setSelectedCameraMovement(movement);
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Camera Movement',
                message: `Are you sure you want to delete "${movement.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams?.get('page')) || 1;

  const findAllCameraMovements = useCallback(
    async (isRefresh = false) => {
      const newIsRefreshing = isRefresh;
      const newIsLoading = !isRefresh;

      setIsLoading(newIsLoading);

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
        setCameraMovements(data);

        if (isRefresh) {
          notificationsService.success('Camera movements refreshed');
        }

        logger.info('GET /camera-movements success', data);
      } catch (error) {
        logger.error('GET /camera-movements failed', error);
        notificationsService.error('Failed to load camera movements');
      } finally {
        setIsLoading(false);
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
    setSelectedCameraMovement(movement || null);
    openModal(modalId);
  };

  const handleDelete = async () => {
    if (!selectedCameraMovement) {
      return;
    }

    try {
      const service = await getCameraMovementsService();
      await service.delete(selectedCameraMovement.id);
      notificationsService.success('Camera movement deleted');
      setSelectedCameraMovement(null);
      findAllCameraMovements(true);
    } catch (error) {
      logger.error('Failed to delete camera movement', error);
      notificationsService.error('Failed to delete camera movement');
      setSelectedCameraMovement(null);
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
          onClose={() => setSelectedCameraMovement(null)}
          onConfirm={() => {
            setSelectedCameraMovement(null);
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
