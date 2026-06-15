'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ComponentSize, ModalEnum, PageScope } from '@genfeedai/enums';
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
import { LazyModalBlacklist } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Checkbox } from '@ui/primitives/checkbox';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';

type BlacklistsState = {
  blacklists: ElementBlacklist[];
  isLoading: boolean;
  updatingIds: Set<string>;
  selectedBlacklist: ElementBlacklist | null;
  adminOrg: string;
  adminBrand: string;
};

type BlacklistsAction =
  | { type: 'FETCH_START'; isRefresh: boolean }
  | { type: 'FETCH_SUCCESS'; blacklists: ElementBlacklist[] }
  | { type: 'FETCH_DONE' }
  | { type: 'SET_SELECTED'; blacklist: ElementBlacklist | null }
  | { type: 'UPDATING_ADD'; id: string }
  | { type: 'UPDATING_REMOVE'; id: string }
  | { type: 'SET_ADMIN_ORG'; org: string }
  | { type: 'SET_ADMIN_BRAND'; brand: string };

function blacklistsReducer(
  state: BlacklistsState,
  action: BlacklistsAction,
): BlacklistsState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, isLoading: !action.isRefresh };
    case 'FETCH_SUCCESS':
      return { ...state, blacklists: action.blacklists };
    case 'FETCH_DONE':
      return { ...state, isLoading: false };
    case 'SET_SELECTED':
      return { ...state, selectedBlacklist: action.blacklist };
    case 'UPDATING_ADD': {
      const next = new Set(state.updatingIds);
      next.add(action.id);
      return { ...state, updatingIds: next };
    }
    case 'UPDATING_REMOVE': {
      const next = new Set(state.updatingIds);
      next.delete(action.id);
      return { ...state, updatingIds: next };
    }
    case 'SET_ADMIN_ORG':
      return { ...state, adminOrg: action.org, adminBrand: '' };
    case 'SET_ADMIN_BRAND':
      return { ...state, adminBrand: action.brand };
    default:
      return state;
  }
}

function BlacklistsListContent({
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

  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const [state, dispatch] = useReducer(blacklistsReducer, undefined, () => ({
    adminBrand: parsedSearchParams.get('brand') || '',
    adminOrg: parsedSearchParams.get('organization') || '',
    blacklists: [] as ElementBlacklist[],
    isLoading: true,
    selectedBlacklist: null,
    updatingIds: new Set<string>(),
  }));

  const {
    blacklists,
    isLoading,
    updatingIds,
    selectedBlacklist,
    adminOrg,
    adminBrand,
  } = state;

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      dispatch({ type: 'SET_ADMIN_ORG', org: orgId });
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
      dispatch({ type: 'SET_ADMIN_BRAND', brand: brandId });
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
        <Checkbox
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
              dispatch({ type: 'SET_SELECTED', blacklist });
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Blacklist',
                message: `Are you sure you want to delete "${blacklist.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(blacklist),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  const findAllBlacklists = useCallback(
    async (isRefresh = false) => {
      dispatch({ type: 'FETCH_START', isRefresh });

      // Notify parent of state changes
      onRefreshingChangeRef.current?.(isRefresh);
      onLoadingChangeRef.current?.(!isRefresh);

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
        dispatch({ type: 'FETCH_SUCCESS', blacklists: data });

        if (isRefresh) {
          notificationsService.success('Blacklists refreshed');
        }

        logger.info('GET /blacklists success', data);
      } catch (error) {
        logger.error('GET /blacklists failed', error);
        notificationsService.error('Failed to load blacklists');
      } finally {
        dispatch({ type: 'FETCH_DONE' });
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

  // Fetch data on mount and when search params change
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
    dispatch({ type: 'SET_SELECTED', blacklist: blacklist || null });
    openModal(modalId);
  };

  const handleToggleDefault = async (blacklist: ElementBlacklist) => {
    dispatch({ type: 'UPDATING_ADD', id: blacklist.id });
    try {
      const service = await getBlacklistsService();
      await service.patch(blacklist.id, { isDefault: !blacklist.isDefault });
      notificationsService.success('Blacklist updated');
      findAllBlacklists(true);
    } catch (error) {
      logger.error('Failed to update blacklist', error);
      notificationsService.error('Failed to update blacklist');
    } finally {
      dispatch({ type: 'UPDATING_REMOVE', id: blacklist.id });
    }
  };

  const handleDelete = async (blacklist: ElementBlacklist) => {
    try {
      const service = await getBlacklistsService();
      await service.delete(blacklist.id);
      notificationsService.success('Blacklist deleted');
      dispatch({ type: 'SET_SELECTED', blacklist: null });
      findAllBlacklists(true);
    } catch (error) {
      logger.error('Failed to delete blacklist', error);
      notificationsService.error('Failed to delete blacklist');
      dispatch({ type: 'SET_SELECTED', blacklist: null });
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
          onClose={() => dispatch({ type: 'SET_SELECTED', blacklist: null })}
          onConfirm={() => {
            dispatch({ type: 'SET_SELECTED', blacklist: null });
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

export default function BlacklistsList(
  props: Parameters<typeof BlacklistsListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <BlacklistsListContent {...props} />
    </Suspense>
  );
}
