'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ComponentSize, ModalEnum } from '@genfeedai/enums';
import type { IElementBlacklist, IQueryParams } from '@genfeedai/interfaces';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementBlacklist } from '@models/elements/blacklist.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BlacklistsService } from '@services/elements/blacklists.service';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import FormCheckbox from '@ui/forms/selectors/checkbox/form-checkbox/FormCheckbox';
import { LazyModalBlacklist } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { PageScope } from '@ui-constants/misc.constant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

export default function BlacklistsList({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const getBlacklistsService = useAuthedService(
    useCallback((token: string) => BlacklistsService.getInstance(token), []),
  );

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const [blacklists, setBlacklists] = useState<ElementBlacklist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [selectedBlacklist, setSelectedBlacklist] =
    useState<ElementBlacklist | null>(null);

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

  const columns: TableColumn<ElementBlacklist>[] = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Category',
      key: 'category',
      render: (blacklist: IElementBlacklist) => (
        <Badge variant="outline" size={ComponentSize.SM} className="uppercase">
          {blacklist.category ?? 'Undefined'}
        </Badge>
      ),
    },
    {
      header: 'Default',
      key: 'isDefault',
      render: (blacklist: ElementBlacklist) => (
        <FormCheckbox
          name={`isDefault-${blacklist.id}`}
          isChecked={blacklist.isDefault}
          isDisabled={
            !blacklist.isActive ||
            updatingIds.has(blacklist.id) ||
            scope !== PageScope.SUPERADMIN
          }
          onChange={() => handleToggleDefault(blacklist)}
        />
      ),
    },
    {
      header: 'Description',
      key: 'description',
      render: (blacklist: ElementBlacklist) => blacklist.description || '-',
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (blacklist: ElementBlacklist) =>
              openBlacklistModal(ModalEnum.BLACKLIST, blacklist),
            tooltip: 'Edit',
          },
          {
            icon: <HiTrash />,
            onClick: (blacklist: ElementBlacklist) => {
              setSelectedBlacklist(blacklist);
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Blacklist',
                message: `Are you sure you want to delete "${blacklist.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams?.get('page')) || 1;

  const findAllBlacklists = useCallback(
    async (isRefresh = false) => {
      const newIsRefreshing = isRefresh;
      const newIsLoading = !isRefresh;

      setIsLoading(newIsLoading);

      // Notify parent of state changes
      onRefreshingChangeRef.current?.(newIsRefreshing);
      onLoadingChangeRef.current?.(newIsLoading);

      try {
        const service = await getBlacklistsService();

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
        setBlacklists(data);

        if (isRefresh) {
          notificationsService.success('Blacklists refreshed');
        }

        logger.info('GET /blacklists success', data);
      } catch (error) {
        logger.error('GET /blacklists failed', error);
        notificationsService.error('Failed to load blacklists');
      } finally {
        setIsLoading(false);
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      getBlacklistsService,
      notificationsService.error,
      notificationsService.success,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  // Fetch data on mount and when searchParams change
  useEffect(() => {
    findAllBlacklists();
  }, [findAllBlacklists]);

  // Register refresh callback
  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => findAllBlacklists(true));
    }
  }, [onRefresh, findAllBlacklists]);

  const openBlacklistModal = (
    modalId: ModalEnum,
    blacklist?: ElementBlacklist,
  ) => {
    setSelectedBlacklist(blacklist || null);
    openModal(modalId);
  };

  const handleToggleDefault = async (blacklist: ElementBlacklist) => {
    setUpdatingIds((prev) => new Set([...prev, blacklist.id]));
    try {
      const service = await getBlacklistsService();
      await service.patch(blacklist.id, { isDefault: !blacklist.isDefault });
      notificationsService.success('Blacklist updated');
      findAllBlacklists(true);
    } catch (error) {
      logger.error('Failed to update blacklist', error);
      notificationsService.error('Failed to update blacklist');
    } finally {
      setUpdatingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(blacklist.id);
        return newSet;
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedBlacklist) {
      return;
    }

    try {
      const service = await getBlacklistsService();
      await service.delete(selectedBlacklist.id);
      notificationsService.success('Blacklist deleted');
      setSelectedBlacklist(null);
      findAllBlacklists(true);
    } catch (error) {
      logger.error('Failed to delete blacklist', error);
      notificationsService.error('Failed to delete blacklist');
      setSelectedBlacklist(null);
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

      <AppTable<ElementBlacklist>
        items={blacklists}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No blacklists found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalBlacklist
          item={selectedBlacklist}
          onClose={() => setSelectedBlacklist(null)}
          onConfirm={() => {
            setSelectedBlacklist(null);
            findAllBlacklists(true);
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="blacklists" />
      </div>
    </>
  );
}
