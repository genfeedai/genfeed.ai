'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import type { IQueryParams } from '@genfeedai/interfaces';
import {
  getBrandLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Brand } from '@models/organization/brand.model';
import {
  useBrandOverlay,
  useConfirmModal,
} from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import { useQuery } from '@tanstack/react-query';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo } from 'react';
import {
  HiOutlineBuildingOffice2,
  HiPencil,
  HiPlus,
  HiTrash,
} from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

const ITEMS_PER_PAGE = 20;

function formatTierLabel(tier: string | null): string {
  if (!tier) {
    return 'a paid plan';
  }

  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatBrandLabel(limit: number): string {
  return limit === 1 ? 'brand kit' : 'brand kits';
}

function BrandsListContent() {
  const { organizationId, settings } = useBrand();
  const { openBrandOverlay } = useBrandOverlay();
  const { openConfirm } = useConfirmModal();
  const notificationsService = NotificationsService.getInstance();

  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString() ?? '';
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
    error: brandsError,
    refetch,
  } = useQuery({
    queryKey: ['brands', organizationId, currentPage],
    queryFn: async () => {
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
    enabled: !!organizationId,
  });

  useEffect(() => {
    if (brandsError) {
      logger.error('Failed to load brands', brandsError);
      notificationsService.error('Failed to load brands');
    }
  }, [brandsError, notificationsService]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const brandLimit = getBrandLimitForTier(settings?.subscriptionTier);
  const isAtBrandLimit =
    brandLimit !== null && !isLoading && (brands?.length ?? 0) >= brandLimit;
  const brandLimitDescription = isAtBrandLimit
    ? `Current plan includes ${brandLimit} ${formatBrandLabel(brandLimit)}. Upgrade to ${formatTierLabel(
        getUpgradeTierForLimit('brands', settings?.subscriptionTier),
      )} to add more.`
    : 'Manage brands and settings.';

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
              <Image
                alt={brand.label}
                className="size-8 rounded-lg object-cover"
                src={brand.logoUrl}
                unoptimized
                width={32}
                height={32}
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <HiOutlineBuildingOffice2 className="size-4 text-primary" />
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
            <ClientFormattedDate
              fallback="-"
              format="date"
              value={brand.createdAt}
            />
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
      description={brandLimitDescription}
      icon={HiOutlineBuildingOffice2}
      right={
        <Button
          variant={ButtonVariant.DEFAULT}
          icon={<HiPlus />}
          label="Add Brand"
          isDisabled={isAtBrandLimit}
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

export default function BrandsList() {
  return (
    <Suspense fallback={null}>
      <BrandsListContent />
    </Suspense>
  );
}
