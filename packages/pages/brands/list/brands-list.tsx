'use client';

import type { IQueryParams } from '@cloud/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { Brand } from '@models/organization/brand.model';
import {
  useBrandOverlay,
  useConfirmModal,
} from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import Button from '@ui/buttons/base/Button';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  HiOutlineBuildingOffice2,
  HiPencil,
  HiPlus,
  HiTrash,
} from 'react-icons/hi2';

const ITEMS_PER_PAGE = 20;

export default function BrandsList() {
  const { organizationId } = useBrand();
  const { openBrandOverlay } = useBrandOverlay();
  const { openConfirm } = useConfirmModal();
  const notificationsService = NotificationsService.getInstance();

  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const currentPage = Number(parsedSearchParams.get('page')) || 1;

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const {
    data: brands,
    isLoading,
    refresh,
  } = useResource(
    async () => {
      if (!organizationId) {
        return [];
      }

      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        organization: organizationId,
        page: currentPage,
      };

      const service = await getBrandsService();
      const data = await service.findAll(query);
      logger.info('GET /brands success', data);
      return data;
    },
    {
      dependencies: [organizationId, currentPage],
      enabled: !!organizationId,
      onError: (error: unknown) => {
        logger.error('Failed to load brands', error);
        notificationsService.error('Failed to load brands');
      },
    },
  );

  const handleDelete = useCallback(
    async (brand: Brand) => {
      try {
        const service = await getBrandsService();
        await service.delete(brand.id);
        logger.info(`DELETE /brands/${brand.id} success`);
        notificationsService.success('Brand deleted successfully');
        await refresh();
      } catch (error) {
        logger.error('Failed to delete brand', error);
        notificationsService.error('Failed to delete brand');
      }
    },
    [getBrandsService, notificationsService, refresh],
  );

  const columns = useMemo(
    () => [
      {
        header: 'Brand',
        key: 'label',
        render: (brand: Brand) => (
          <div className="flex items-center gap-3">
            {brand.logoUrl ? (
              <img
                alt={brand.label}
                className="h-8 w-8 rounded-lg object-cover"
                src={brand.logoUrl}
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <HiOutlineBuildingOffice2 className="h-4 w-4 text-primary" />
              </div>
            )}
            <span className="font-medium">{brand.label}</span>
          </div>
        ),
      },
      {
        header: 'Slug',
        key: 'slug',
        render: (brand: Brand) => (
          <span className="text-sm text-foreground/70">
            {brand.slug ? `@${brand.slug}` : '-'}
          </span>
        ),
      },
      {
        header: 'Platforms',
        key: 'credentials',
        render: (brand: Brand) => (
          <span className="text-sm text-foreground/70">
            {brand.totalCredentials} connected
          </span>
        ),
      },
      {
        header: 'Created',
        key: 'createdAt',
        render: (brand: Brand) => (
          <span className="text-sm text-foreground/70">
            {brand.createdAt
              ? new Date(brand.createdAt).toLocaleDateString()
              : '-'}
          </span>
        ),
      },
    ],
    [],
  );

  const actions = useMemo(
    () => [
      {
        icon: <HiPencil />,
        onClick: (brand: Brand) => {
          openBrandOverlay(brand, () => refresh(), 'edit');
        },
        tooltip: 'Edit',
      },
      {
        icon: <HiTrash />,
        onClick: (brand: Brand) => {
          openConfirm({
            confirmLabel: 'Delete',
            isError: true,
            label: 'Delete Brand',
            message: `Are you sure you want to delete "${brand.label}"? This action cannot be undone.`,
            onConfirm: () => handleDelete(brand),
          });
        },
        tooltip: 'Delete',
      },
    ],
    [openBrandOverlay, openConfirm, handleDelete, refresh],
  );

  return (
    <Container
      label="Brands"
      description="Manage brands and settings."
      icon={HiOutlineBuildingOffice2}
      right={
        <Button
          variant={ButtonVariant.DEFAULT}
          icon={<HiPlus />}
          label="Add Brand"
          onClick={() => openBrandOverlay(null, () => refresh())}
        />
      }
    >
      <AppTable<Brand>
        actions={actions}
        columns={columns}
        emptyLabel="No brands yet"
        getRowKey={(brand) => brand.id}
        isLoading={isLoading}
        items={brands || []}
        onRowClick={(brand) =>
          openBrandOverlay(brand, () => refresh(), 'overview')
        }
      />

      <AutoPagination showTotal totalLabel="brands" />
    </Container>
  );
}
