'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/enums';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { IFolder, IQueryParams } from '@genfeedai/interfaces';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Folder } from '@models/content/folder.model';
import type { ContentProps } from '@props/layout/content.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { FoldersService } from '@services/content/folders.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useReducer } from 'react';
import { HiFolderOpen, HiPencil, HiPlus, HiTrash } from 'react-icons/hi2';
import { buildFoldersColumns } from './folders-list-columns';
import FoldersListModals from './folders-list-modals';

const FOLDER_SORT_OPTIONS = [
  { label: 'Default Sort', value: '' },
  { label: 'Label (A-Z)', value: 'label: 1' },
  { label: 'Label (Z-A)', value: 'label: -1' },
  { label: 'Newest First', value: 'createdAt: -1' },
  { label: 'Oldest First', value: 'createdAt: 1' },
];

type FoldersListState = {
  selectedFolder: IFolder | null;
  adminOrg: string;
  adminBrand: string;
  query: IFilters;
  filters: IFiltersState;
};

type FoldersListAction =
  | { type: 'SET_SELECTED_FOLDER'; payload: IFolder | null }
  | { type: 'SET_ADMIN_ORG'; payload: string }
  | { type: 'SET_ADMIN_BRAND'; payload: string }
  | { type: 'SET_ORG_AND_CLEAR_BRAND'; payload: string }
  | { type: 'SET_QUERY'; payload: IFilters }
  | { type: 'SET_FILTERS'; payload: IFiltersState }
  | {
      type: 'SET_FILTERS_AND_QUERY';
      payload: { filters: IFiltersState; query: IFilters };
    };

function foldersListReducer(
  state: FoldersListState,
  action: FoldersListAction,
): FoldersListState {
  switch (action.type) {
    case 'SET_SELECTED_FOLDER':
      return { ...state, selectedFolder: action.payload };
    case 'SET_ADMIN_ORG':
      return { ...state, adminOrg: action.payload };
    case 'SET_ADMIN_BRAND':
      return { ...state, adminBrand: action.payload };
    case 'SET_ORG_AND_CLEAR_BRAND':
      return { ...state, adminOrg: action.payload, adminBrand: '' };
    case 'SET_QUERY':
      return { ...state, query: action.payload };
    case 'SET_FILTERS':
      return { ...state, filters: action.payload };
    case 'SET_FILTERS_AND_QUERY':
      return {
        ...state,
        filters: action.payload.filters,
        query: action.payload.query,
      };
    default:
      return state;
  }
}

function FoldersListContent({ scope = PageScope.BRAND }: ContentProps) {
  const { isSignedIn } = useAuthIdentity();
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

  const getFoldersService = useAuthedService((token: string) =>
    FoldersService.getInstance(token),
  );

  const [state, dispatch] = useReducer(foldersListReducer, undefined, () => ({
    selectedFolder: null,
    adminOrg: parsedSearchParams.get('organization') || '',
    adminBrand: parsedSearchParams.get('brand') || '',
    query: {} as IFilters,
    filters: {
      format: '',
      provider: '',
      search: '',
      sort: 'label: 1', // Default sort
      status: '',
      type: '',
    } as IFiltersState,
  }));

  const { selectedFolder, adminOrg, adminBrand, query, filters } = state;

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      dispatch({ type: 'SET_ORG_AND_CLEAR_BRAND', payload: orgId });
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
      dispatch({ type: 'SET_ADMIN_BRAND', payload: brandId });
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

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  const {
    data: folders = [] as Folder[],
    isLoading,
    isFetching,
    error: foldersError,
    refetch: refreshFolders,
  } = useQuery({
    queryKey: [
      'folders',
      query,
      filters,
      currentPage,
      scope,
      adminOrg,
      adminBrand,
    ],
    queryFn: async () => {
      const url = `GET /folders`;

      const service = await getFoldersService();

      const queryParams: IQueryParams = {
        ...query,
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        sort: filters.sort || undefined,
      };

      if (scope === PageScope.SUPERADMIN) {
        if (adminOrg) {
          queryParams.organization = adminOrg;
        }
        if (adminBrand) {
          queryParams.brand = adminBrand;
        }
      }

      const data = await service.findAll(queryParams);
      logger.info(`${url} success`, data);
      return data;
    },
    enabled: !!isSignedIn,
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (foldersError) {
      logger.error('GET /folders failed', foldersError);
      notificationsService.error('Failed to load folders');
    }
  }, [foldersError, notificationsService]);

  const handleToggleActive = useCallback(
    async (folder: IFolder) => {
      try {
        const service = await getFoldersService();
        await service.patch(folder.id, {
          isActive: folder.isActive === false,
        });

        refreshFolders();
      } catch (error) {
        logger.error('Failed to update folder status', error);
        notificationsService.error('Failed to update folder status');
      }
    },
    [getFoldersService, refreshFolders, notificationsService],
  );

  const handleDelete = useCallback(
    async (folder: IFolder) => {
      try {
        const service = await getFoldersService();
        await service.delete(folder.id);
        notificationsService.success('Folder deleted');
        dispatch({ type: 'SET_SELECTED_FOLDER', payload: null });
        refreshFolders();
      } catch (error) {
        logger.error('Failed to delete folder', error);
        notificationsService.error('Failed to delete folder');
        dispatch({ type: 'SET_SELECTED_FOLDER', payload: null });
      }
    },
    [getFoldersService, notificationsService, refreshFolders],
  );

  const openFoldersModal = useCallback(
    (modalId: ModalEnum, folder?: IFolder) => {
      dispatch({ type: 'SET_SELECTED_FOLDER', payload: folder || null });
      openModal(modalId);
    },
    [],
  );

  const columns = useMemo(
    () => buildFoldersColumns(handleToggleActive),
    [handleToggleActive],
  );

  const actions = useMemo(
    () => [
      {
        icon: <HiPencil />,
        onClick: (folder: Folder) => openFoldersModal(ModalEnum.FOLDER, folder),
        tooltip: 'Edit',
      },
      {
        icon: <HiTrash />,
        onClick: (folder: Folder) => {
          dispatch({ type: 'SET_SELECTED_FOLDER', payload: folder });
          openConfirm({
            confirmLabel: 'Delete',
            isError: true,
            label: 'Delete Folder',
            message: `Are you sure you want to delete "${folder.label}"? This action cannot be undone.`,
            onConfirm: () => handleDelete(folder),
          });
        },
        tooltip: 'Delete',
      },
    ],
    [openConfirm, openFoldersModal, handleDelete],
  );

  return (
    <Container
      label="Folders"
      description="Organize content into folders."
      icon={HiFolderOpen}
      right={
        <>
          <FiltersButton
            filters={filters}
            onFiltersChange={(f: IFiltersState, q: IFilters) => {
              dispatch({
                type: 'SET_FILTERS_AND_QUERY',
                payload: { filters: f, query: q },
              });
            }}
            visibleFilters={{
              format: false,
              provider: false,
              search: true,
              sort: true,
              status: false,
              type: false,
            }}
            filterOptions={{
              sort: FOLDER_SORT_OPTIONS,
            }}
          />

          <ButtonRefresh
            onClick={() => refreshFolders()}
            isRefreshing={isRefreshing}
          />

          {scope !== PageScope.SUPERADMIN && (
            <Button
              label="Folder"
              icon={<HiPlus />}
              variant={ButtonVariant.DEFAULT}
              onClick={() => openFoldersModal(ModalEnum.FOLDER)}
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

      <AppTable<Folder>
        items={folders}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No folders found"
      />

      <FoldersListModals
        selectedFolder={selectedFolder}
        onConfirm={() => refreshFolders()}
        scope={scope}
      />
    </Container>
  );
}

export default function FoldersList(
  props: Parameters<typeof FoldersListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <FoldersListContent {...props} />
    </Suspense>
  );
}
