'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import type { IQueryParams } from '@genfeedai/contracts/interfaces';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Brand } from '@models/organization/brand.model';
import type { TableRowLink } from '@props/ui/display/table.props';
import {
  useBrandOverlay,
  useConfirmModal,
} from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@ui/card/EmptyState';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Building2, ExternalLink, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

const ITEMS_PER_PAGE = 20;

function BrandsListContent() {
  const { organizationId } = useBrand();
  const { openBrandOverlay } = useBrandOverlay();
  const { openConfirm } = useConfirmModal();
  const { orgSlug } = useOrgUrl();
  const { push } = useRouter();
  const notificationsService = NotificationsService.getInstance();

  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const currentPage = Number(parsedSearchParams.get('page')) || 1;

  // Edit / row open go to the brand settings page — the real home for brand
  // identity, voice, interview, publishing, and agent defaults. Overlay stays
  // create-only so the list can spin up a brand without a full navigation.
  const openBrandSettings = useCallback(
    (brand: Brand) => {
      if (!orgSlug || !brand.slug) {
        notificationsService.error('Brand settings are unavailable');
        return;
      }

      push(createBrandAppRoute(orgSlug, brand.slug, APP_ROUTES.SETTINGS.ROOT));
    },
    [notificationsService, orgSlug, push],
  );

  // A brand missing an org or its own slug has no settings URL; that row stays
  // non-navigable and the row action reports why.
  const getBrandLink = useCallback(
    (brand: Brand): TableRowLink | undefined =>
      orgSlug && brand.slug
        ? {
            href: createBrandAppRoute(
              orgSlug,
              brand.slug,
              APP_ROUTES.SETTINGS.ROOT,
            ),
            label: `Open ${brand.label} settings`,
          }
        : undefined,
    [orgSlug],
  );

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
          <div className="flex items-center gap-2.5">
            {brand.logoUrl ? (
              <Image
                alt={brand.label}
                className="size-6 rounded-md object-cover"
                src={brand.logoUrl}
                sizes="24px"
                unoptimized={!canOptimizeImageSource(brand.logoUrl)}
                width={24}
                height={24}
              />
            ) : (
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                <Building2 className="size-3.5 text-primary" />
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
        icon: <ExternalLink className="size-3.5" />,
        onClick: openBrandSettings,
        tooltip: 'Open settings',
      },
      {
        icon: <Trash2 className="size-3.5" />,
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
    [handleDelete, openBrandSettings, openConfirm],
  );

  return (
    <Container
      label="Brands"
      description="Manage brands and settings."
      icon={Building2}
      right={
        <Button
          variant={ButtonVariant.DEFAULT}
          icon={<Plus />}
          label="Add Brand"
          onClick={() => openBrandOverlay(null, () => refresh())}
        />
      }
    >
      <AppTable<Brand>
        actions={actions}
        columns={columns}
        emptyLabel="No brands yet"
        emptyState={
          <EmptyState
            title="No brands yet"
            description="Create a brand to manage settings, platforms, and publishing identity."
            icon={Building2}
            action={{
              label: 'Add Brand',
              onClick: () => openBrandOverlay(null, () => refresh()),
              variant: ButtonVariant.DEFAULT,
            }}
          />
        }
        getRowKey={(brand) => brand.id}
        isLoading={isLoading}
        items={brands || []}
        getRowLink={getBrandLink}
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
