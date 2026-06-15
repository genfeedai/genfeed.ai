'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/enums';
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
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { LazyModalFontFamily } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { HiPencil, HiPlus, HiTrash } from 'react-icons/hi2';

type FetchStatus = 'idle' | 'loading' | 'refreshing';

type State = {
  fontFamilies: FontFamily[];
  fetchStatus: FetchStatus;
  selectedFontFamily: IFontFamily | null;
  adminOrg: string;
  adminBrand: string;
};

type Action =
  | { type: 'FETCH_START'; isRefreshing: boolean }
  | { type: 'FETCH_SUCCESS'; fontFamilies: FontFamily[] }
  | { type: 'FETCH_DONE' }
  | { type: 'SET_SELECTED'; fontFamily: IFontFamily | null }
  | { type: 'SET_ADMIN_ORG'; orgId: string }
  | { type: 'SET_ADMIN_BRAND'; brandId: string };

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
    case 'SET_ADMIN_ORG':
      return { ...state, adminOrg: action.orgId, adminBrand: '' };
    case 'SET_ADMIN_BRAND':
      return { ...state, adminBrand: action.brandId };
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

  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const getFontFamiliesService = useAuthedService(
    useCallback((token: string) => FontFamiliesService.getInstance(token), []),
  );

  const [state, dispatch] = useReducer(reducer, {
    fontFamilies: [],
    fetchStatus: 'loading',
    selectedFontFamily: null,
    adminOrg: parsedSearchParams.get('organization') || '',
    adminBrand: parsedSearchParams.get('brand') || '',
  });

  const {
    fontFamilies,
    fetchStatus,
    selectedFontFamily,
    adminOrg,
    adminBrand,
  } = state;

  // Derive isLoading and isRefreshing from fetchStatus
  const isLoading = fetchStatus === 'loading';
  const isRefreshing = fetchStatus === 'refreshing';

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      dispatch({ type: 'SET_ADMIN_ORG', orgId });
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
      dispatch({ type: 'SET_ADMIN_BRAND', brandId });
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

        if (isRefreshingArg) {
          notificationsService.success('Font families refreshed');
        }

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
      notificationsService.success,
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
    </Container>
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
