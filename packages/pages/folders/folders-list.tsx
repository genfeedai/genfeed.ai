'use client';

import { useAuth } from '@clerk/nextjs';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import type { IFolder, IQueryParams } from '@genfeedai/interfaces';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { Folder } from '@models/content/folder.model';
import type { ContentProps } from '@props/layout/content.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { FoldersService } from '@services/content/folders.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import AppTable from '@ui/display/table/Table';
import FormToggle from '@ui/forms/selectors/toggle/form-toggle/FormToggle';
import Container from '@ui/layout/container/Container';
import { LazyModalFolder } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { PageScope } from '@ui-constants/misc.constant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { HiFolderOpen, HiPencil, HiPlus, HiTrash } from 'react-icons/hi2';

export default function FoldersList({ scope = PageScope.BRAND }: ContentProps) {
  const { isSignedIn } = useAuth();
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
  const currentPage = Number(searchParams?.get('page')) || 1;

  // Load folders using useResource (handles AbortController cleanup properly)
  const {
    data: folders,
    isLoading,
    isRefreshing,
    refresh: refreshFolders,
  } = useResource(
    async () => {
      const url = `GET /folders`;

      const service = await getFoldersService();

      // Build API query with proper sort format
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
    {
      defaultValue: [] as Folder[],
      dependencies: [query, filters, currentPage, scope, adminOrg, adminBrand],
      enabled: !!isSignedIn,
      onError: (error) => {
        logger.error('GET /folders failed', error);
        notificationsService.error('Failed to load folders');
      },
    },
  );

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

  const handleDelete = useCallback(async () => {
    if (!selectedFolder) {
      return;
    }

    try {
      const service = await getFoldersService();
      await service.delete(selectedFolder.id);
      notificationsService.success('Folder deleted');
      setSelectedFolder(null);
      refreshFolders();
    } catch (error) {
      logger.error('Failed to delete folder', error);
      notificationsService.error('Failed to delete folder');
      setSelectedFolder(null);
    }
  }, [selectedFolder, getFoldersService, notificationsService, refreshFolders]);

  const openFoldersModal = useCallback(
    (modalId: ModalEnum, folder?: IFolder) => {
      setSelectedFolder(folder || null);
      openModal(modalId);
    },
    [],
  );

  const columns: TableColumn<Folder>[] = useMemo(
    () => [
      {
        header: 'Label',
        key: 'label',
        render: (folder: Folder) => folder.label || '-',
      },
      {
        header: 'Description',
        key: 'description',
        render: (folder: Folder) => folder.description || '-',
      },
      {
        header: 'Brand',
        key: 'brand',
        render: (folder: Folder) => folder.brand?.label || '-',
      },
      {
        header: 'Active',
        key: 'active',
        render: (folder: IFolder) => (
          <FormToggle
            isChecked={folder.isActive !== false}
            onChange={() => handleToggleActive(folder)}
          />
        ),
      },
    ],
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
            onConfirm: () => handleDelete(),
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

      <LazyModalFolder
        item={selectedFolder}
        onConfirm={() => refreshFolders()}
        scope={scope}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="folders" />
      </div>
    </Container>
  );
}
