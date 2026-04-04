'use client';

import type { IElementStyle, IQueryParams } from '@genfeedai/interfaces';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum } from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementStyle } from '@models/elements/style.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { StylesService } from '@services/elements/styles.service';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { LazyModalStyle } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { PageScope } from '@ui-constants/misc.constant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

export default function StylesList({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const getStylesService = useAuthedService(
    useCallback((token: string) => StylesService.getInstance(token), []),
  );

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const [styles, setStyles] = useState<ElementStyle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedStyle, setSelectedStyle] = useState<ElementStyle | null>(null);

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

  const columns: TableColumn<ElementStyle>[] = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      className: 'max-w-48 truncate',
      header: 'Description',
      key: 'description',
      render: (style: IElementStyle) => style.description || '-',
    },
    {
      className: 'min-w-32 max-w-xs',
      header: 'Model',
      key: 'models',
      render: (style: IElementStyle) => (
        <div className="flex flex-wrap gap-2">
          {style.models?.map((model, index) => (
            <Badge
              key={index}
              className={`text-xs border border-white/[0.08] bg-transparent uppercase ${model ? 'text-primary' : 'text-warning'}`}
            >
              {model}
            </Badge>
          ))}
        </div>
      ),
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (style: IElementStyle) =>
              openStyleModal(ModalEnum.STYLE, style),
            tooltip: 'Edit',
          },
          {
            icon: <HiTrash />,
            onClick: (style: IElementStyle) =>
              openStyleModal(ModalEnum.CONFIRM, style),
            tooltip: 'Delete',
          },
        ]
      : [];

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams?.get('page')) || 1;

  const findAllStyles = useCallback(
    async (isRefresh = false) => {
      setIsLoading(!isRefresh);

      // Notify parent of state changes
      onRefreshingChangeRef.current?.(isRefresh);
      onLoadingChangeRef.current?.(!isRefresh);

      try {
        const service = await getStylesService();

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
        setStyles(data);

        if (isRefresh) {
          notificationsService.success('Styles refreshed');
        }

        logger.info('GET /styles success', data);
      } catch (error) {
        logger.error('GET /styles failed', error);
        notificationsService.error('Failed to load styles');
      } finally {
        setIsLoading(false);
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      getStylesService,
      notificationsService.error,
      notificationsService.success,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  // Fetch data on mount and when searchParams change
  useEffect(() => {
    findAllStyles();
  }, [findAllStyles]);

  // Register refresh callback
  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => findAllStyles(true));
    }
  }, [onRefresh, findAllStyles]);

  const openStyleModal = (modalId: ModalEnum, style?: IElementStyle) => {
    setSelectedStyle(style || null);

    if (modalId === ModalEnum.CONFIRM && style) {
      return openConfirm({
        confirmLabel: 'Delete',
        isError: true,
        label: 'Delete Style',
        message: `Are you sure you want to delete "${style.label}"? This action cannot be undone.`,
        onConfirm: handleDelete,
      });
    }

    openModal(modalId);
  };

  const handleDelete = async () => {
    if (!selectedStyle) {
      return;
    }

    try {
      const service = await getStylesService();
      await service.delete(selectedStyle.id);
      notificationsService.success('Style deleted');
      setSelectedStyle(null);
      findAllStyles(true);
    } catch (error) {
      logger.error('Failed to delete style', error);
      notificationsService.error('Failed to delete style');
      setSelectedStyle(null);
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

      <AppTable<ElementStyle>
        items={styles}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No styles found"
      />

      {scope === PageScope.SUPERADMIN && (
        <>
          <LazyModalStyle
            item={selectedStyle}
            onClose={() => setSelectedStyle(null)}
            onConfirm={() => {
              setSelectedStyle(null);
              findAllStyles(true);
            }}
          />

          {/* LazyModalConfirm migrated to GlobalModalsProvider */}
        </>
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="styles" />
      </div>
    </>
  );
}
