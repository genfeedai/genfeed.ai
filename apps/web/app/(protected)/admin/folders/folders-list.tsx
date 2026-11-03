'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IFolder, IQueryParams } from '@genfeedai/contracts/interfaces';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/contracts/interfaces/utils/filters.interface';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Folder } from '@models/content/folder.model';
import type { ContentProps } from '@props/layout/content.props';
import { FoldersService } from '@services/content/folders.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useMemo, useReducer } from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import FiltersSearch from '@/components/content/filters-button/FiltersSearch';
import type {
  FoldersListAction,
  FoldersListState,
} from '@/features/admin/props/folders.props';
import { useInlineRecordSave } from '@/hooks/ui/use-inline-record-save/use-inline-record-save';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';
import { buildFoldersColumns } from './folders-list-columns';
import FoldersListModals from './folders-list-modals';

const FOLDER_SORT_KEYS = ['label', 'isActive'] as const;

const FOLDER_SORT_OPTIONS = [
  { label: 'Default Sort', value: '' },
  { label: 'Label (A-Z)', value: 'label: 1' },
  { label: 'Label (Z-A)', value: 'label: -1' },
  { label: 'Newest First', value: 'createdAt: -1' },
  { label: 'Oldest First', value: 'createdAt: 1' },
];

function foldersListReducer(
  state: FoldersListState,
  action: FoldersListAction,
): FoldersListState {
  switch (action.type) {
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
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const { isSignedIn } = useAuthIdentity();
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const searchParams = useSearchParams();

  const getFoldersService = useAuthedService((token: string) =>
    FoldersService.getInstance(token),
  );

  const [state, dispatch] = useReducer(foldersListReducer, undefined, () => ({
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

  const { query, filters } = state;
  // The organization and brand are facets of the Filters menu; the URL owns them.
  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;
  // A clicked column header wins over the toolbar sort until it is cleared.
  const {
    sort: headerSort,
    sortKey,
    sortDirection,
    onSortChange,
  } = useTableSort({ allowedKeys: FOLDER_SORT_KEYS });

  const {
    data: foldersPage,
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
      headerSort,
    ],
    queryFn: async ({ signal }) => {
      const url = `GET /folders`;

      const service = await getFoldersService();

      const queryParams: IQueryParams = {
        ...query,
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        sort: headerSort ?? (filters.sort || undefined),
      };

      if (scope === PageScope.SUPERADMIN) {
        if (adminOrg) {
          queryParams.organization = adminOrg;
        }
        if (adminBrand) {
          queryParams.brand = adminBrand;
        }
      }

      const data = await service.findAllPage(queryParams, signal);
      logger.info(`${url} success`, data);
      return data;
    },
    enabled: !!isSignedIn,
  });

  const folders = foldersPage?.items ?? [];
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
        refreshFolders();
      } catch (error) {
        logger.error('Failed to delete folder', error);
        notificationsService.error('Failed to delete folder');
      }
    },
    [getFoldersService, notificationsService, refreshFolders],
  );

  const saveFolder = useInlineRecordSave<Partial<IFolder>>({
    errorMessage: 'Failed to update folder',
    onSaved: () => refreshFolders(),
    save: async (id, patch) => (await getFoldersService()).patch(id, patch),
  });

  const columns = useMemo(
    () => buildFoldersColumns(handleToggleActive),
    [handleToggleActive],
  );

  const actions = useMemo(
    () => [
      {
        icon: <Trash2 />,
        onClick: (folder: Folder) => {
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
    [openConfirm, handleDelete],
  );

  const rowSidebar = useMemo(
    () =>
      createSummaryRowSidebar<Folder>({
        getFacts: (folder) => [
          {
            editor: {
              ariaLabel: fieldsT('label'),
              isRequired: true,
              kind: 'text',
              onSave: (label) => saveFolder(folder.id, { label }),
              value: folder.label,
            },
            id: 'label',
            label: fieldsT('label'),
          },
          {
            editor: {
              ariaLabel: fieldsT('description'),
              isMultiline: true,
              kind: 'text',
              onSave: (description) => saveFolder(folder.id, { description }),
              placeholder: '-',
              value: folder.description,
            },
            id: 'description',
            label: fieldsT('description'),
          },
          { id: 'brand', label: fieldsT('brand'), value: folder.brand?.label },
          {
            id: 'organization',
            label: fieldsT('organization'),
            value: folder.organization?.label,
          },
          {
            id: 'tags',
            label: fieldsT('tags'),
            value: folder.tags?.join(', '),
          },
          {
            editor: {
              ariaLabel: fieldsT('active'),
              isChecked: folder.isActive !== false,
              kind: 'switch',
              onSave: (isActive) => saveFolder(folder.id, { isActive }),
            },
            id: 'active',
            label: fieldsT('active'),
          },
        ],
        getId: (folder) => folder.id,
        getTitle: (folder) => folder.label || '-',
        kind: 'record',
      }),
    [saveFolder, fieldsT],
  );

  return (
    <Container
      label="Folders"
      icon={FolderOpen}
      leading={
        <FiltersSearch
          filterOptions={{ sort: FOLDER_SORT_OPTIONS }}
          filters={filters}
          hasAdminScope={scope === PageScope.SUPERADMIN}
          onFiltersChange={(f: IFiltersState, q: IFilters) => {
            dispatch({
              type: 'SET_FILTERS_AND_QUERY',
              payload: { filters: f, query: q },
            });
          }}
          visibleFilters={{
            format: false,
            provider: false,
            sort: true,
            status: false,
            type: false,
          }}
        />
      }
      refresh={
        <ButtonRefresh
          onClick={() => refreshFolders()}
          isRefreshing={isRefreshing}
        />
      }
      right={
        scope !== PageScope.SUPERADMIN && (
          <Button
            label="Folder"
            icon={<Plus />}
            variant={ButtonVariant.DEFAULT}
            onClick={() => openModal(ModalEnum.FOLDER)}
          />
        )
      }
    >
      <AppTable<Folder>
        items={folders}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        emptyLabel="No folders found"
      />

      <FoldersListModals
        onConfirm={() => refreshFolders()}
        scope={scope}
        totals={
          foldersPage
            ? {
                totalDocs: foldersPage.total,
                totalPages: foldersPage.totalPages,
              }
            : EMPTY_PAGE_TOTALS
        }
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
