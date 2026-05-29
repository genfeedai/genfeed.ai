'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { EMPTY_STATES } from '@genfeedai/constants';
import { ModalEnum, PageScope } from '@genfeedai/enums';
import type { IQueryParams, ITag } from '@genfeedai/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TagsListProps } from '@props/tags/tags-list.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { TagsService } from '@services/content/tags.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import { Switch } from '@ui/primitives/switch';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';
import {
  TagAccountCell,
  TagCategoryCell,
  TagDescriptionCell,
  TagKeyCell,
  TagLabelCell,
  TagOrgCell,
} from './tags-list-columns';
import TagsListModals from './tags-list-modals';

function isGlobalTag(tag: ITag): boolean {
  return !tag.organization && !tag.user;
}

function TagsListContent({
  scope,
  filter,
  externalFilters,
  refreshTrigger,
}: TagsListProps) {
  const { brandId, organizationId } = useBrand();

  const getTagsService = useAuthedService((token: string) =>
    TagsService.getInstance(token),
  );

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();

  const [selectedTag, setSelectedTag] = useState<ITag | null>(null);

  const { openConfirm } = useConfirmModal();

  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

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

  // Use external filters if provided, otherwise use defaults
  const filters = externalFilters || {
    format: '',
    model: '',
    provider: '',
    search: '',
    sort: 'createdAt',
    status: '',
    type: '',
  };

  const tagsQueryKey = useMemo(
    () => [
      'tags',
      organizationId,
      brandId,
      scope,
      refreshTrigger,
      filter,
      filters.sort,
      filters.search,
      filters.type,
      adminOrg,
      adminBrand,
    ],
    [
      organizationId,
      brandId,
      scope,
      refreshTrigger,
      filter,
      filters.sort,
      filters.search,
      filters.type,
      adminOrg,
      adminBrand,
    ],
  );

  const queryClient = useQueryClient();

  const {
    data: tags,
    isLoading,
    isFetching,
    error: tagsError,
    refetch: refresh,
  } = useQuery<ITag[]>({
    queryKey: tagsQueryKey,
    queryFn: async () => {
      if (scope === PageScope.ORGANIZATION && !organizationId) {
        return [];
      }

      const url =
        scope === PageScope.SUPERADMIN
          ? `GET /tags`
          : `GET /organizations/${organizationId}/tags`;

      const query: IQueryParams = {};

      query.isActive = true;

      if (filters.search) {
        query.search = filters.search;
      }

      if (filters.type) {
        query.category = filters.type;
      }

      if (filters.sort) {
        let sortDirection = '1';
        if (filters.sort === 'createdAt') {
          sortDirection = '-1';
        }
        query.sort = `${filters.sort}: ${sortDirection}`;
      }

      let data: ITag[];
      if (scope === PageScope.SUPERADMIN) {
        if (adminOrg) {
          query.organization = adminOrg;
        }
        if (adminBrand) {
          query.brand = adminBrand;
        }
        const service = await getTagsService();
        data = await service.findAll(query);
      } else {
        if (!organizationId) {
          return [];
        }
        if (brandId) {
          query.brand = brandId;
        }
        const service = await getOrganizationsService();
        data = await service.findOrganizationTags(organizationId, query);
      }

      logger.info(`${url} success`, data);
      return data;
    },
    enabled:
      scope === PageScope.SUPERADMIN ||
      (scope === PageScope.ORGANIZATION && !!organizationId),
  });

  const wasFetchingRef = useRef(false);

  useEffect(() => {
    if (wasFetchingRef.current && !isFetching && !isLoading) {
      notificationsService.success('Tags refreshed');
    }
    wasFetchingRef.current = isFetching;
  }, [isFetching, isLoading, notificationsService]);

  useEffect(() => {
    if (tagsError) {
      logger.error('Failed to load tags', tagsError);
      notificationsService.error('Failed to load tags');
    }
  }, [tagsError, notificationsService]);

  // Filter tags by scope only (search and other filters are done by API)
  const filteredAndSortedTags = (tags || []).filter((t) => {
    // Apply scope filter based on filter prop
    switch (filter) {
      case 'default':
        // Default = no specific org or account (global tags)
        if (t.organization || t.user) {
          return false;
        }
        break;
      case 'organization':
        // Only org-specific tags
        if (!t.organization) {
          return false;
        }
        break;
      case 'account':
        // Only account-specific tags
        if (!t.user) {
          return false;
        }
        break;
      // No filter for 'all' or other cases
    }
    // 'all' shows everything
    return true;
  });

  const handleToggleActive = useCallback(
    async (tag: ITag) => {
      const newValue = tag.isActive === false;

      try {
        const service = await getTagsService();
        await service.patch(tag.id, {
          isActive: newValue,
        });

        notificationsService.success(
          `Tag ${newValue ? 'activated' : 'deactivated'}`,
        );

        if (tags) {
          queryClient.setQueryData(
            tagsQueryKey,
            tags.map((t) =>
              t.id === tag.id ? { ...t, isActive: newValue } : t,
            ),
          );
        }
      } catch (error) {
        logger.error('Failed to update tag status', error);
        notificationsService.error('Failed to update tag status');
      }
    },
    [getTagsService, notificationsService, tags, queryClient, tagsQueryKey],
  );

  // Build columns dynamically based on scopeFilter - memoized to prevent re-renders
  const columns = useMemo(
    () => [
      {
        header: 'Label',
        key: 'label',
        render: (t: ITag) => <TagLabelCell tag={t} />,
      },
      {
        header: 'Description',
        key: 'description',
        render: (t: ITag) => <TagDescriptionCell tag={t} />,
      },
      {
        header: 'Key',
        key: 'key',
        render: (t: ITag) => <TagKeyCell tag={t} />,
      },
      {
        header: 'Category',
        key: 'category',
        render: (t: ITag) => <TagCategoryCell tag={t} />,
      },
      // Conditionally add Organization column
      // - For superadmin: always show
      // - For others: hide for default and organization filters
      ...(scope === PageScope.SUPERADMIN ||
      (filter !== 'default' && filter !== 'organization')
        ? [
            {
              header: 'Organization',
              key: 'organization',
              render: (t: ITag) => <TagOrgCell tag={t} />,
            },
          ]
        : []),
      // Conditionally add Account column
      // - For superadmin: always show
      // - For others: hide for default and account filters
      ...(scope === PageScope.SUPERADMIN ||
      (filter !== 'default' && filter !== 'account')
        ? [
            {
              header: 'Account',
              key: 'user',
              render: (t: ITag) => <TagAccountCell tag={t} />,
            },
          ]
        : []),
      {
        header: 'Active',
        key: 'active',
        render: (tag: ITag) => (
          <Switch
            isChecked={tag.isActive !== false}
            onChange={() => handleToggleActive(tag)}
          />
        ),
      },
    ],
    [scope, filter, handleToggleActive],
  );

  // Helper to check if a tag can be edited by the current user
  const canEditTag = useCallback(
    (tag: ITag): boolean => {
      // Don't allow editing global tags in non-superadmin scope
      if (isGlobalTag(tag)) {
        return false;
      }

      // If tag has an organization, it must match the current organization
      if (tag.organization && tag.organization.id !== organizationId) {
        return false;
      }

      return true;
    },
    [organizationId],
  );

  const openTagModal = useCallback((modalId: ModalEnum, tag?: ITag) => {
    setSelectedTag(tag || null);
    openModal(modalId);
  }, []);

  const handleDeleteTag = useCallback(
    async (tag: ITag) => {
      const url = `DELETE /tags/${tag.id}`;
      try {
        const service = await getTagsService();
        const data = await service.delete(tag.id);
        logger.info(`${url} success`, data);

        notificationsService.success('Tag deleted successfully');

        setSelectedTag(null);
        await refresh();
      } catch (error) {
        logger.error('Failed to delete tag', error);

        notificationsService.error('Failed to delete tag');
        setSelectedTag(null);
      }
    },
    [getTagsService, notificationsService, refresh],
  );

  const actions = useMemo(
    () =>
      scope === PageScope.SUPERADMIN
        ? [
            {
              icon: <HiPencil />,
              onClick: (tag: ITag) => openTagModal(ModalEnum.TAG, tag),
              tooltip: 'Edit',
            },
            {
              icon: <HiTrash />,
              onClick: (tag: ITag) => {
                setSelectedTag(tag);
                openConfirm({
                  confirmLabel: 'Delete',
                  isError: true,
                  label: 'Delete Tag',
                  message: `Are you sure you want to delete the tag "${tag.label}"? This action cannot be undone.`,
                  onConfirm: () => handleDeleteTag(tag),
                });
              },
              tooltip: 'Delete',
            },
          ]
        : [
            {
              icon: <HiPencil />,
              isVisible: canEditTag,
              onClick: (tag: ITag) => openTagModal(ModalEnum.TAG, tag),
              tooltip: 'Edit',
            },
          ],
    [scope, openConfirm, canEditTag, openTagModal, handleDeleteTag],
  );

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

      <AppTable<ITag>
        items={filteredAndSortedTags}
        actions={actions}
        columns={columns}
        isLoading={isLoading}
        getRowKey={(t) => t.id}
        emptyLabel={EMPTY_STATES.TAGS_YET}
      />

      <TagsListModals
        scope={scope}
        selectedTag={selectedTag}
        organizationId={organizationId}
        onConfirm={() => {
          setSelectedTag(null);
          refresh();
        }}
      />
    </>
  );
}

export default function TagsList(props: Parameters<typeof TagsListContent>[0]) {
  return (
    <Suspense fallback={null}>
      <TagsListContent {...props} />
    </Suspense>
  );
}
