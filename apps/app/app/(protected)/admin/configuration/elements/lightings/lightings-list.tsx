'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum, PageScope } from '@genfeedai/enums';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { IElementLighting, IQueryParams } from '@genfeedai/interfaces';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementLighting } from '@models/elements/lighting.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { LightingsService } from '@services/elements/lightings.service';
import { useQuery } from '@tanstack/react-query';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import { LazyModalLighting } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

function LightingsListContent({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps): ReactNode {
  const { isSignedIn } = useAuthIdentity();
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
  const currentPage = Number(parsedSearchParams.get('page')) || 1;

  // Admin org/brand filter values derived from URL (superadmin only)
  const adminOrg = parsedSearchParams.get('organization') ?? '';
  const adminBrand = parsedSearchParams.get('brand') ?? '';

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
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

  const getLightingsService = useAuthedService(
    useCallback((token: string) => LightingsService.getInstance(token), []),
  );

  const [selectedLighting, setSelectedLighting] =
    useState<IElementLighting | null>(null);

  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  const {
    data: lightings = [] as ElementLighting[],
    isLoading,
    isFetching,
    error: lightingsError,
    refetch: refreshLightings,
  } = useQuery({
    queryKey: ['lightings', currentPage, scope, adminOrg, adminBrand],
    queryFn: async () => {
      const service = await getLightingsService();
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
      logger.info('GET /lightings success', data);
      return data;
    },
    enabled: !!isSignedIn,
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (lightingsError) {
      logger.error('GET /lightings failed', lightingsError);
      notificationsService.error('Failed to load lightings');
    }
  }, [lightingsError, notificationsService]);

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChangeRef.current?.(isLoading);
  }, [isLoading]);

  useEffect(() => {
    onRefreshingChangeRef.current?.(isRefreshing);
  }, [isRefreshing]);

  const columns: TableColumn<ElementLighting>[] = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Description',
      key: 'description',
      render: (lighting: ElementLighting) => lighting.description || '-',
    },
  ];

  // Register refresh callback
  useEffect(() => {
    if (onRefresh) {
      return onRefresh(async () => {
        await refreshLightings();
        notificationsService.success('Lightings refreshed');
      });
    }
  }, [onRefresh, refreshLightings, notificationsService]);

  function openLightingModal(
    modalId: ModalEnum,
    lighting?: IElementLighting,
  ): void {
    setSelectedLighting(lighting ?? null);
    openModal(modalId);
  }

  async function handleDelete(
    lighting: IElementLighting | null,
  ): Promise<void> {
    if (!lighting) {
      return;
    }

    try {
      const service = await getLightingsService();
      await service.delete(lighting.id);
      notificationsService.success('Lighting deleted');
      setSelectedLighting(null);
      refreshLightings();
    } catch (error) {
      logger.error('Failed to delete lighting', error);
      notificationsService.error('Failed to delete lighting');
      setSelectedLighting(null);
    }
  }

  function handleConfirmDelete(lighting: ElementLighting): void {
    setSelectedLighting(lighting);
    openConfirm({
      confirmLabel: 'Delete',
      isError: true,
      label: 'Delete Lighting',
      message: `Are you sure you want to delete "${lighting.label}"? This action cannot be undone.`,
      onConfirm: () => handleDelete(lighting),
    });
  }

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (lighting: ElementLighting) =>
              openLightingModal(ModalEnum.LIGHTING, lighting),
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

      <AppTable<ElementLighting>
        items={lightings}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No lightings found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalLighting
          item={selectedLighting}
          onClose={() => setSelectedLighting(null)}
          onConfirm={() => {
            setSelectedLighting(null);
            refreshLightings();
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="lightings" />
      </div>
    </>
  );
}
export default function LightingsList(
  props: Parameters<typeof LightingsListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <LightingsListContent {...props} />
    </Suspense>
  );
}
