'use client';

import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IFontFamily,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { FontFamily } from '@models/elements/font-family.model';
import type {
  FontFamiliesAction as Action,
  FontFamiliesState as State,
} from '@props/admin/font-families.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { FontFamiliesService } from '@services/elements/font-families.service';
import AdminOrgBrandUrlFilter, {
  useAdminOrgBrandParams,
} from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { LazyModalFontFamily } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useReducer, useRef } from 'react';

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_START':
      return {
        ...state,
        fetchStatus: action.isRefreshing ? 'refreshing' : 'loading',
      };
    case 'FETCH_SUCCESS':
      return { ...state, fontFamilies: action.fontFamilies };
    case 'FETCH_DONE':
      return { ...state, fetchStatus: 'idle' };
    case 'SET_SELECTED':
      return { ...state, selectedFontFamily: action.fontFamily };
    default:
      return state;
  }
}

function FontFamiliesListContent({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const searchParams = useSearchParams();
  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  const getFontFamiliesService = useAuthedService(
    useCallback((token: string) => FontFamiliesService.getInstance(token), []),
  );

  const [state, dispatch] = useReducer(reducer, {
    fontFamilies: [],
    fetchStatus: 'loading',
    selectedFontFamily: null,
  });

  const { fontFamilies, fetchStatus, selectedFontFamily } = state;

  // Derive isLoading and isRefreshing from fetchStatus
  const isLoading = fetchStatus === 'loading';
  const isRefreshing = fetchStatus === 'refreshing';

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  const columns: TableColumn<FontFamily>[] = [
    {
      header: 'Label',
      key: 'label',
      subtext: (fontFamily: FontFamily) => fontFamily.description,
    },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <Pencil />,
            onClick: (fontFamily: FontFamily) =>
              openFontFamilyModal(ModalEnum.FONT_FAMILY, fontFamily),
            tooltip: 'Edit',
          },
          {
            icon: <Trash2 />,
            onClick: (fontFamily: FontFamily) => {
              dispatch({ type: 'SET_SELECTED', fontFamily });
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Font Family',
                message: `Are you sure you want to delete "${fontFamily.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(fontFamily),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  const findAllFontFamilies = useCallback(
    async (isRefreshingArg = false) => {
      const url = 'GET /font-families';

      dispatch({ type: 'FETCH_START', isRefreshing: isRefreshingArg });

      // Notify parent of state changes
      onRefreshingChangeRef.current?.(isRefreshingArg);
      onLoadingChangeRef.current?.(!isRefreshingArg);

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
        dispatch({ type: 'FETCH_SUCCESS', fontFamilies: data });

        logger.info(`${url} success`, data);
      } catch (error) {
        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to load font families');
      } finally {
        dispatch({ type: 'FETCH_DONE' });
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      getFontFamiliesService,
      notificationsService.error,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  // Fetch data on mount and when search params change
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
    dispatch({ type: 'SET_SELECTED', fontFamily: fontFamily || null });
    openModal(modalId);
  };

  const handleDelete = async (fontFamily: IFontFamily) => {
    try {
      const service = await getFontFamiliesService();
      await service.delete(fontFamily.id);
      notificationsService.success('Font family deleted');
      dispatch({ type: 'SET_SELECTED', fontFamily: null });
      findAllFontFamilies(true);
    } catch (error) {
      logger.error('Failed to delete font family', error);
      notificationsService.error('Failed to delete font family');
      dispatch({ type: 'SET_SELECTED', fontFamily: null });
    }
  };

  return (
    <AdminPageShell
      title="Font Families"
      onRefresh={() => findAllFontFamilies(true)}
      isRefreshing={isRefreshing}
      dropdowns={
        scope === PageScope.SUPERADMIN ? <AdminOrgBrandUrlFilter /> : undefined
      }
      primaryAction={
        scope === PageScope.SUPERADMIN ? (
          <Button
            label="Font Family"
            icon={<Plus />}
            variant={ButtonVariant.DEFAULT}
            onClick={() => openFontFamilyModal(ModalEnum.FONT_FAMILY)}
          />
        ) : undefined
      }
    >
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
          onClose={() => dispatch({ type: 'SET_SELECTED', fontFamily: null })}
          onConfirm={() => {
            dispatch({ type: 'SET_SELECTED', fontFamily: null });
            findAllFontFamilies(true);
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="font families" />
      </div>
    </AdminPageShell>
  );
}

export default function FontFamiliesList(
  props: Parameters<typeof FontFamiliesListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <FontFamiliesListContent {...props} />
    </Suspense>
  );
}
