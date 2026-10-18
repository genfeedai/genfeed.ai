import { ComponentSize, ModalEnum, PageScope } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IElementBlacklist,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ElementBlacklist } from '@models/elements/blacklist.model';
import type {
  BlacklistsAction,
  BlacklistsState,
} from '@props/admin/blacklists.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BlacklistsService } from '@services/elements/blacklists.service';
import { useAdminOrgBrandParams } from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { LazyModalBlacklist } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Checkbox } from '@ui/primitives/checkbox';
import { Pencil, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useReducer, useRef } from 'react';

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
    default:
      return state;
  }
}

function BlacklistsListContent({
  filters,
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

  const searchParams = useSearchParams();

  const [state, dispatch] = useReducer(blacklistsReducer, undefined, () => ({
    blacklists: [] as ElementBlacklist[],
    isLoading: true,
    selectedBlacklist: null,
    updatingIds: new Set<string>(),
  }));

  const { blacklists, isLoading, updatingIds, selectedBlacklist } = state;

  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  const columns: TableColumn<ElementBlacklist>[] = [
    {
      header: 'Label',
      key: 'label',
      subtext: (blacklist: ElementBlacklist) => blacklist.description,
    },
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
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <Pencil />,
            onClick: (blacklist: ElementBlacklist) =>
              openBlacklistModal(ModalEnum.BLACKLIST, blacklist),
            tooltip: 'Edit',
          },
          {
            icon: <Trash2 />,
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
          search: filters?.search || undefined,
          type: filters?.type || undefined,
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
      filters?.search,
      filters?.type,
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
