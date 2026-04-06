'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import type { IFontFamily, IQueryParams } from '@genfeedai/interfaces';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { FontFamily } from '@models/elements/font-family.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { FontFamiliesService } from '@services/elements/font-families.service';
import Button from '@ui/buttons/base/Button';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { LazyModalFontFamily } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { PageScope } from '@ui-constants/misc.constant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiPencil, HiPlus, HiTrash } from 'react-icons/hi2';

export default function FontFamiliesList({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
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

  const getFontFamiliesService = useAuthedService(
    useCallback((token: string) => FontFamiliesService.getInstance(token), []),
  );

  const [fontFamilies, setFontFamilies] = useState<FontFamily[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedFontFamily, setSelectedFontFamily] =
    useState<IFontFamily | null>(null);

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

  const columns: TableColumn<FontFamily>[] = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Description',
      key: 'description',
      render: (fontFamily: FontFamily) => fontFamily.description || '-',
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (fontFamily: FontFamily) =>
              openFontFamilyModal(ModalEnum.FONT_FAMILY, fontFamily),
            tooltip: 'Edit',
          },
          {
            icon: <HiTrash />,
            onClick: (fontFamily: FontFamily) => {
              setSelectedFontFamily(fontFamily);
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Font Family',
                message: `Are you sure you want to delete "${fontFamily.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams?.get('page')) || 1;

  const findAllFontFamilies = useCallback(
    async (isRefreshing = false) => {
      const url = 'GET /font-families';

      const newIsRefreshing = isRefreshing;
      const newIsLoading = !isRefreshing;

      setIsRefreshing(newIsRefreshing);
      setIsLoading(newIsLoading);

      // Notify parent of state changes
      onRefreshingChangeRef.current?.(newIsRefreshing);
      onLoadingChangeRef.current?.(newIsLoading);

      try {
        const service = await getFontFamiliesService();

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
        setFontFamilies(data);

        if (isRefreshing) {
          notificationsService.success('Font families refreshed');
        }

        logger.info(`${url} success`, data);
      } catch (error) {
        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to load font families');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      getFontFamiliesService,
      notificationsService.error,
      notificationsService.success,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  // Fetch data on mount and when searchParams change
  useEffect(() => {
    findAllFontFamilies();
  }, [findAllFontFamilies]);

  // Register refresh callback
  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => findAllFontFamilies(true));
    }
  }, [onRefresh, findAllFontFamilies]);

  const openFontFamilyModal = (
    modalId: ModalEnum,
    fontFamily?: IFontFamily,
  ) => {
    setSelectedFontFamily(fontFamily || null);
    openModal(modalId);
  };

  const handleDelete = async () => {
    if (!selectedFontFamily) {
      return;
    }

    try {
      const service = await getFontFamiliesService();
      await service.delete(selectedFontFamily.id);
      notificationsService.success('Font family deleted');
      setSelectedFontFamily(null);
      findAllFontFamilies(true);
    } catch (error) {
      logger.error('Failed to delete font family', error);
      notificationsService.error('Failed to delete font family');
      setSelectedFontFamily(null);
    }
  };

  return (
    <Container
      label="Font Families"
      description="Typography options for content creation."
      right={
        <>
          <ButtonRefresh
            onClick={() => findAllFontFamilies(true)}
            isRefreshing={isRefreshing}
          />

          {scope === PageScope.SUPERADMIN && (
            <Button
              label="Font Family"
              icon={<HiPlus />}
              variant={ButtonVariant.DEFAULT}
              onClick={() => openFontFamilyModal(ModalEnum.FONT_FAMILY)}
            />
          )}
        </>
      }
    >
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

      <AppTable<FontFamily>
        items={fontFamilies}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No font families found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalFontFamily
          item={selectedFontFamily}
          onClose={() => setSelectedFontFamily(null)}
          onConfirm={() => {
            setSelectedFontFamily(null);
            findAllFontFamilies(true);
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="font families" />
      </div>
    </Container>
  );
}
