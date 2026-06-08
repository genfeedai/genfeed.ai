'use client';

import { useAuth } from '@clerk/nextjs';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/enums';
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
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { HiFolderOpen, HiPencil, HiPlus, HiTrash } from 'react-icons/hi2';
import { buildFoldersColumns } from './folders-list-columns';
import FoldersListModals from './folders-list-modals';

function FoldersListContent({ scope = PageScope.BRAND }: ContentProps) {
  const { isSignedIn } = useAuth();
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

  const [selectedFolder, setSelectedFolder] = useState<IFolder | null>(null);

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
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
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
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  // Filters state
  const [query, setQuery] = useState<IFilters>({});
  const [filters, setFilters] = useState<IFiltersState>({
    format: '',
    provider: '',
    search: '',
    sort: 'label: 1', // Default sort
    status: '',
    type: '',
  });

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
        setSelectedFolder(null);
        refreshFolders();
      } catch (error) {
        logger.error('Failed to delete folder', error);
        notificationsService.error('Failed to delete folder');
        setSelectedFolder(null);
      }
    },
    [getFoldersService, notificationsService, refreshFolders],
  );

  const openFoldersModal = useCallback(
    (modalId: ModalEnum, folder?: IFolder) => {
      setSelectedFolder(folder || null);
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
          setSelectedFolder(folder);
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

  // Custom sort options for folders
  const FOLDER_SORT_OPTIONS = [
    { label: 'Default Sort', value: '' },
    { label: 'Label (A-Z)', value: 'label: 1' },
    { label: 'Label (Z-A)', value: 'label: -1' },
    { label: 'Newest First', value: 'createdAt: -1' },
    { label: 'Oldest First', value: 'createdAt: 1' },
  ];

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
              setFilters(f);
              setQuery(q);
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
