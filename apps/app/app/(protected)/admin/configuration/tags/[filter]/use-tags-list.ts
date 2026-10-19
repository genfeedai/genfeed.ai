import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { ModalEnum } from '@genfeedai/contracts';
import type {
  ContentScope,
  IQueryParams,
  ITag,
} from '@genfeedai/contracts/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TagsListProps } from '@props/tags/tags-list.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { TagsService } from '@services/content/tags.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminOrgBrandParams } from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import { useCallback, useEffect, useMemo, useState } from 'react';

const SUPERADMIN: ContentScope = 'superadmin';
const ORGANIZATION: ContentScope = 'organization';

function isGlobalTag(tag: ITag): boolean {
  return !tag.organization && !tag.user;
}

export function useTagsList({
  scope,
  filter,
  externalFilters,
  refreshTrigger,
}: TagsListProps) {
  const { brandId, organizationId } = useBrand();

  const getTagsService = useAuthedService((token: string) =>
    TagsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();

  const [selectedTag, setSelectedTag] = useState<ITag | null>(null);

  const { openConfirm } = useConfirmModal();

  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  const filters = externalFilters ?? {
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
      if (scope === ORGANIZATION && !organizationId) {
        return [];
      }

      const url = 'GET /tags';

      const query: IQueryParams = {};
      query.isActive = true;

      if (filters.search) {
        query.search = filters.search;
      }
      if (filters.type) {
        query.category = filters.type;
      }
      if (filters.sort) {
        const sortDirection = filters.sort === 'createdAt' ? '-1' : '1';
        query.sort = `${filters.sort}: ${sortDirection}`;
      }

      if (scope === SUPERADMIN) {
        if (adminOrg) {
          query.organization = adminOrg;
        }
        if (adminBrand) {
          query.brand = adminBrand;
        }
      } else {
        if (!organizationId) {
          return [];
        }
        query.organization = organizationId;
        if (brandId) {
          query.brand = brandId;
        }
      }

      const service = await getTagsService();
      const data = await service.findAll(query);

      logger.info(`${url} success`, data);
      return data;
    },
    enabled:
      scope === SUPERADMIN || (scope === ORGANIZATION && !!organizationId),
  });

  const isRefreshing = isFetching;

  useEffect(() => {
    if (tagsError) {
      logger.error('Failed to load tags', tagsError);
      notificationsService.error('Failed to load tags');
    }
  }, [tagsError, notificationsService]);

  const filteredAndSortedTags = (tags ?? []).filter((t) => {
    switch (filter) {
      case 'default':
        if (t.organization || t.user) return false;
        break;
      case 'organization':
        if (!t.organization) return false;
        break;
      case 'account':
        if (!t.user) return false;
        break;
    }
    return true;
  });

  const handleToggleActive = useCallback(
    async (tag: ITag) => {
      const newValue = tag.isActive === false;
      try {
        const service = await getTagsService();
        await service.patch(tag.id, { isActive: newValue });
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

  const canEditTag = useCallback(
    (tag: ITag): boolean => {
      if (isGlobalTag(tag)) return false;
      if (tag.organization && tag.organization.id !== organizationId)
        return false;
      return true;
    },
    [organizationId],
  );

  const openTagModal = useCallback((modalId: ModalEnum, tag?: ITag) => {
    setSelectedTag(tag ?? null);
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

  const openDeleteConfirm = useCallback(
    (tag: ITag) => {
      setSelectedTag(tag);
      openConfirm({
        confirmLabel: 'Delete',
        isError: true,
        label: 'Delete Tag',
        message: `Are you sure you want to delete the tag "${tag.label}"? This action cannot be undone.`,
        onConfirm: () => handleDeleteTag(tag),
      });
    },
    [openConfirm, handleDeleteTag],
  );

  return {
    adminBrand,
    adminOrg,
    canEditTag,
    filteredAndSortedTags,
    handleDeleteTag,
    handleToggleActive,
    isLoading,
    isRefreshing,
    openDeleteConfirm,
    openTagModal,
    organizationId,
    refresh,
    scope,
    selectedTag,
    setSelectedTag,
  };
}
