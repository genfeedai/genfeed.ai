'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
  createBrandAppRoute,
  ITEMS_PER_PAGE,
  PUBLISHING_POSTS_QUERY_KEYS,
} from '@genfeedai/constants';
import {
  ModelCategory,
  PageScope,
  type Platform,
  PostRepurposeMode,
  PostStatus,
  TargetExecutionState,
  ViewType,
  WebSocketEventStatus,
} from '@genfeedai/enums';
import type { IIngredient, IPost, IPreset } from '@genfeedai/interfaces';
import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import {
  getPublishingPostHref,
  normalizePostsPlatform,
} from '@helpers/content/posts.helper';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { buildPostsCardActions } from '@pages/posts/list/components/PostsCardActions';
import { buildPostsTableActions } from '@pages/posts/list/components/PostsTableActions';
import { buildPostsTableColumns } from '@pages/posts/list/components/PostsTableColumns';
import {
  getAvailablePlatforms,
  getCredentialForPlatform,
} from '@pages/posts/list/components/posts-credential.helpers';
import { generatePosts } from '@pages/posts/list/components/posts-generate.helpers';
import {
  fetchPosts,
  type PostsListResult,
} from '@pages/posts/list/components/posts-query.helpers';
import {
  buildPostsListQueryKey,
  getDefaultPostsSort,
  type PostsPublicationState,
  type PublishingPostsView,
} from '@pages/posts/list/posts-list-query';
import type { ContentProps } from '@props/layout/content.props';
import {
  useConfirmDeleteModal,
  useIngredientOverlay,
  usePostRemixModal,
  usePostRepurposeModal,
} from '@providers/global-modals/global-modals.provider';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { PresetsService } from '@services/elements/presets.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Shared empty fallbacks — see `hydratedPostPresets` below. These must be
// module-level constants so an omitted prop keeps a stable identity.
const EMPTY_POST_PRESETS: IPreset[] = [];
const EMPTY_POSTS: IPost[] = [];

// View type constants (exported so component can import them)
export const VIEW_TYPE_GRID = ViewType.GRID;
export const VIEW_TYPE_TABLE = ViewType.TABLE;

export const getDefaultSort = getDefaultPostsSort;

export interface UsePostsListParams {
  initialPostPresets?: IPreset[];
  initialPagination?: PostsListResult['pagination'];
  initialPosts?: IPost[];
  platform?: string;
  /** `null` = all lifecycle states; omit for scope default (not-posted on publisher). */
  publicationState?: PostsPublicationState | null;
  scope: ContentProps['scope'];
  status?: PostStatus;
  onRewriteWithAgent?: (post: IPost) => void;
  onSuggestScheduleWithAgent?: (post: IPost) => void;
}

export function usePostsList({
  initialPostPresets,
  initialPagination,
  initialPosts,
  platform: platformParam,
  publicationState: publicationStateProp,
  scope,
  status: statusProp,
  onRewriteWithAgent,
  onSuggestScheduleWithAgent,
}: UsePostsListParams) {
  // `?? []` inline would mint a fresh array on every render. That identity
  // feeds `useEffect(..., [hydratedPostPresets])` below, which calls
  // `setPostPresets` — an unconditional render loop on every caller that omits
  // `initialPostPresets` (e.g. the superadmin posts page). Memoize the
  // fallbacks so an omitted prop stays referentially stable.
  const hydratedPostPresets = useMemo(
    () => initialPostPresets ?? EMPTY_POST_PRESETS,
    [initialPostPresets],
  );
  const hydratedPosts = useMemo(
    () => initialPosts ?? EMPTY_POSTS,
    [initialPosts],
  );
  const hydratedPagination = useMemo(
    () =>
      initialPagination ?? {
        page: 1,
        pageSize: ITEMS_PER_PAGE,
        total: hydratedPosts.length,
        totalPages: 1,
      },
    [initialPagination, hydratedPosts.length],
  );
  // Explicit `null` means the Posts library (every lifecycle state). Undefined
  // keeps the historical publisher default (not posted yet).
  const publicationState =
    publicationStateProp === null
      ? undefined
      : (publicationStateProp ??
        (scope === PageScope.PUBLISHING && !statusProp
          ? 'not-posted'
          : undefined));

  const platform = normalizePostsPlatform(platformParam);
  const platformFilter = platform !== 'all' ? platform : undefined;

  const { credentials } = useBrand();
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const isFetchReady = isCollectionFetchReady({
    brandId,
    isReady,
    organizationId,
    pageScope,
  });

  const router = useRouter();
  const { href } = useOrgUrl();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const status = statusProp;

  const [adminOrg, setAdminOrg] = useState(
    () => parsedSearchParams.get('organization') || '',
  );
  const [adminBrand, setAdminBrand] = useState(
    () => parsedSearchParams.get('brand') || '',
  );

  const { openIngredientOverlay } = useIngredientOverlay();
  const { openConfirmDelete } = useConfirmDeleteModal();
  const { openPostRemixModal } = usePostRemixModal();
  const { openPostRepurposeModal } = usePostRepurposeModal();

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const getPresetsService = useAuthedService((token: string) =>
    PresetsService.getInstance(token),
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [postPresets, setPostPresets] =
    useState<IPreset[]>(hydratedPostPresets);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  const postsRef = useRef<IPost[]>([]);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const { setFiltersNode, setRefresh, setViewToggleNode } = usePostsLayout();

  const [viewType, setViewType] = useState<ViewType>(() => {
    if (scope === PageScope.PUBLISHING) {
      return VIEW_TYPE_GRID;
    }
    return VIEW_TYPE_TABLE;
  });

  const { isReady: isSocketReady, subscribe: subscribeToSocket } =
    useSocketManager();

  const searchQueryParam = parsedSearchParams.get('search') || '';
  const sortQueryParam =
    parsedSearchParams.get('sort') || getDefaultSort(status);

  const [filters, setFilters] = useState<IFiltersState>(() => ({
    format: '',
    provider: '',
    search: searchQueryParam,
    sort: sortQueryParam,
    status: status || '',
    type: '',
  }));

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      search: searchQueryParam,
      sort: sortQueryParam,
      status: status || '',
    }));
  }, [searchQueryParam, sortQueryParam, status]);

  const [toolbarSearchValue, setToolbarSearchValue] =
    useState(searchQueryParam);

  useEffect(() => {
    setToolbarSearchValue(searchQueryParam);
  }, [searchQueryParam]);

  const currentPage = Number(parsedSearchParams.get('page')) || 1;

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

  const filterSearch = filters.search;
  const filterStatus = Array.isArray(filters.status)
    ? filters.status[0]
    : filters.status;
  const filterSort = filters.sort;

  const queryClient = useQueryClient();

  const postsQueryKey = buildPostsListQueryKey({
    adminBrand,
    adminOrg,
    scope,
    brandId,
    organizationId,
    platformFilter,
    publicationState,
    currentPage,
    filterSearch,
    filterSort: filterSort || '',
    filterStatus: filterStatus || '',
    status,
  });

  const {
    data: postsResult = {
      pagination: hydratedPagination,
      posts: hydratedPosts,
    },
    isLoading,
    refetch: refreshPosts,
    error: postsError,
  } = useQuery<PostsListResult>({
    enabled: scope === PageScope.SUPERADMIN || isFetchReady,
    initialData:
      initialPosts != null
        ? {
            pagination: hydratedPagination,
            posts: hydratedPosts,
          }
        : undefined,
    staleTime: initialPosts != null ? Number.POSITIVE_INFINITY : undefined,
    queryFn: () =>
      fetchPosts({
        adminBrand,
        adminOrg,
        brandId,
        currentPage,
        filterSearch,
        filterSort,
        filterStatus,
        getBrandsService,
        getOrganizationsService,
        getPostsService,
        organizationId,
        platformFilter,
        publicationState,
        scope,
        status,
      }),
    queryKey: postsQueryKey,
  });
  const { pagination, posts } = postsResult;

  useEffect(() => {
    if (postsError instanceof Error) {
      logger.error('GET /posts failed', postsError);
    }
  }, [postsError]);

  const setPosts = useCallback(
    (updatedPosts: IPost[]) => {
      queryClient.setQueryData<PostsListResult>(postsQueryKey, (current) => ({
        pagination: current?.pagination ?? pagination,
        posts: updatedPosts,
      }));
    },
    [queryClient, pagination, ...postsQueryKey, postsQueryKey],
  );

  const findAllPosts = useCallback(() => refreshPosts(), [refreshPosts]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const loadPostPresets = useCallback(async () => {
    if (scope !== PageScope.PUBLISHING || initialPostPresets !== undefined) {
      return;
    }

    try {
      const presetsService = await getPresetsService();
      if (!presetsService) {
        return;
      }

      const presetsData = (await presetsService.findAllPages({
        category: ModelCategory.TEXT,
      })) as IPreset[];

      setPostPresets(
        presetsData.filter((preset) =>
          preset.key.startsWith('preset.text.post.'),
        ),
      );
    } catch (error) {
      logger.error('Failed to load post presets', error);
    }
  }, [scope, getPresetsService, initialPostPresets]);

  useEffect(() => {
    setPostPresets(hydratedPostPresets);
  }, [hydratedPostPresets]);

  useEffect(() => {
    loadPostPresets();
  }, [loadPostPresets]);

  const handlePostEvaluated = useCallback(
    (postId: string, score: number) => {
      const updatedPosts = postsRef.current.map((post) =>
        post.id === postId ? { ...post, evalScore: score } : post,
      );
      setPosts(updatedPosts);
    },
    [setPosts],
  );

  const getCredentialForCurrentPlatform = useCallback(
    (p: Platform) => getCredentialForPlatform(p, credentials),
    [credentials],
  );

  const availablePlatforms = useMemo(
    () => getAvailablePlatforms(credentials),
    [credentials],
  );

  useEffect(() => {
    if (
      isLoading ||
      pagination.totalPages < 1 ||
      currentPage <= pagination.totalPages
    ) {
      return;
    }

    const params = new URLSearchParams(searchParamsString);
    if (pagination.totalPages === 1) {
      params.delete('page');
    } else {
      params.set('page', String(pagination.totalPages));
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }, [
    currentPage,
    isLoading,
    pagination.totalPages,
    pathname,
    router,
    searchParamsString,
  ]);

  const hasPublicPosts = useMemo(
    () =>
      posts.some(
        (post) => post.targetExecutionState === TargetExecutionState.PUBLISHED,
      ),
    [posts],
  );

  const handleDelete = useCallback(
    (post: IPost) => {
      openConfirmDelete({
        entity: {
          id: post.id,
          label: post.label || post.description || 'this post',
        },
        entityName: 'post',
        onConfirm: async () => {
          try {
            const postsService = await getPostsService();
            await postsService.delete(post.id);
            await findAllPosts();

            logger.info('Post deleted successfully', { postId: post.id });
          } catch (error) {
            logger.error('Failed to delete post', error);
            notificationsService.error(
              'Failed to delete post. Please try again.',
            );
          }
        },
      });
    },
    [openConfirmDelete, getPostsService, findAllPosts, notificationsService],
  );

  /**
   * Full post surface at `/publishing/posts/:id` — same PostDetail as the list
   * sheet (threads, @grok, first comment, media). Not the thin form-only shell.
   * Carry the list URL for optional return navigation.
   */
  const handleEditPost = useCallback(
    (post: IPost) => {
      const editorRoute = createArtifactEditorRoute('post', post.id);
      const postOrganizationSlug =
        post.organization &&
        typeof post.organization === 'object' &&
        'slug' in post.organization &&
        typeof post.organization.slug === 'string'
          ? post.organization.slug
          : '';
      const editorHref =
        scope === PageScope.SUPERADMIN &&
        postOrganizationSlug &&
        post.brand?.slug
          ? createBrandAppRoute(
              postOrganizationSlug,
              post.brand.slug,
              editorRoute,
            )
          : href(editorRoute);

      router.push(editorHref);
    },
    [href, router, scope],
  );

  const handleOpenPostDetail = useCallback((post: IPost) => {
    setSelectedPostId(post.id);
  }, []);

  const handleViewIngredient = useCallback(
    (post: IPost) => {
      const ingredient = post.ingredients?.[0] as IIngredient | undefined;
      if (!ingredient) {
        return;
      }

      openIngredientOverlay(ingredient, () => findAllPosts());
    },
    [findAllPosts, openIngredientOverlay],
  );

  const handleOpenPlatformUrl = useCallback((post: IPost) => {
    if (post.platformUrl) {
      window.open(post.platformUrl, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const handleRemixPost = useCallback(
    (post: IPost) => {
      openPostRemixModal(post, async (description, label) => {
        const service = await getPostsService();
        const remixPost = await service.createRemix(
          post.id,
          description,
          label,
        );
        notificationsService.success('Remix post created as draft');
        router.push(href(getPublishingPostHref(remixPost.id)));
      });
    },
    [getPostsService, notificationsService, openPostRemixModal, router, href],
  );

  const handleRepurposePost = useCallback(
    (post: IPost) => {
      openPostRepurposeModal(
        { id: post.id, label: post.label, platform: post.platform },
        async (platform, mode) => {
          const service = await getPostsService();
          const draft = await service.repurpose(post.id, { mode, platform });
          if (mode === PostRepurposeMode.AGENT) {
            notificationsService.success(
              'Rewritten draft sent to the review queue',
            );
            router.push(
              href(
                draft.reviewBatchId
                  ? `/publishing/review?batch=${draft.reviewBatchId}&filter=ready`
                  : '/publishing/review',
              ),
            );
          } else {
            notificationsService.success('Repurposed draft created');
            router.push(href(getPublishingPostHref(draft.id)));
          }
        },
      );
    },
    [
      getPostsService,
      notificationsService,
      openPostRepurposeModal,
      router,
      href,
    ],
  );

  const handleRetryPost = useCallback(
    async (post: IPost) => {
      try {
        const postsService = await getPostsService();
        await postsService.retry(post.id);
        notificationsService.success('Post queued for retry');
      } catch (error) {
        notificationsService.error('Failed to retry post. Please try again.');
        logger.error('Failed to retry post', error);
      } finally {
        await findAllPosts();
      }
    },
    [findAllPosts, getPostsService, notificationsService],
  );

  const columns = useMemo(
    () =>
      buildPostsTableColumns({
        browserTimezone,
        hasPublicPosts,
        onEvaluated: handlePostEvaluated,
        onOpenIngredient: (ingredient) =>
          openIngredientOverlay(ingredient, () => findAllPosts()),
        onStatusChanged: () => findAllPosts(),
        scope,
      }),
    [
      hasPublicPosts,
      browserTimezone,
      scope,
      handlePostEvaluated,
      openIngredientOverlay,
      findAllPosts,
    ],
  );

  const actions = useMemo(
    () =>
      buildPostsTableActions({
        onDelete: handleDelete,
        onEdit: handleEditPost,
        onOpenPlatformUrl: handleOpenPlatformUrl,
        onRemix: handleRemixPost,
        onRepurpose: handleRepurposePost,
        onRewriteWithAgent,
        onRetry: handleRetryPost,
        onSuggestScheduleWithAgent,
        onViewIngredient: handleViewIngredient,
        scope,
      }),
    [
      scope,
      handleDelete,
      handleEditPost,
      handleOpenPlatformUrl,
      handleRemixPost,
      handleRepurposePost,
      onRewriteWithAgent,
      handleRetryPost,
      onSuggestScheduleWithAgent,
      handleViewIngredient,
    ],
  );

  const editableStatuses = useMemo(
    () => [
      PostStatus.SCHEDULED,
      PostStatus.DRAFT,
      PostStatus.FAILED,
      PostStatus.PROCESSING,
    ],
    [],
  );

  const { primaryCardAction, secondaryCardActions } = useMemo(
    () =>
      buildPostsCardActions({
        editableStatuses,
        onDelete: handleDelete,
        onEdit: handleEditPost,
        onOpenPlatformUrl: handleOpenPlatformUrl,
        onRemix: handleRemixPost,
        onRepurpose: handleRepurposePost,
        onRewriteWithAgent,
        onRetry: handleRetryPost,
        onSuggestScheduleWithAgent,
        onViewIngredient: handleViewIngredient,
        scope,
      }),
    [
      editableStatuses,
      handleDelete,
      handleEditPost,
      handleOpenPlatformUrl,
      handleRemixPost,
      handleRepurposePost,
      onRewriteWithAgent,
      handleRetryPost,
      onSuggestScheduleWithAgent,
      handleViewIngredient,
      scope,
    ],
  );

  useEffect(() => {
    setRefresh(() => () => {
      void refreshPosts();
    });
    return () => {
      setRefresh(() => () => {});
    };
  }, [setRefresh, refreshPosts]);

  const processingPostIds = useMemo(
    () =>
      posts
        .filter(
          (post) =>
            post.targetExecutionState === TargetExecutionState.PUBLISHING,
        )
        .map((post) => post.id)
        .sort(),
    [posts],
  );

  useEffect(() => {
    if (!isSocketReady || processingPostIds.length === 0) {
      return;
    }

    const unsubscribes: Array<() => void> = [];

    processingPostIds.forEach((postId) => {
      const postEventPath = WebSocketPaths.publication(postId);
      const unsubscribe = subscribeToSocket(
        postEventPath,
        (data: { status: string; result?: IPost; error?: string }) => {
          if (
            data.status === WebSocketEventStatus.COMPLETED ||
            data.status === WebSocketEventStatus.FAILED
          ) {
            findAllPosts();
          }
        },
      );
      if (unsubscribe) {
        unsubscribes.push(unsubscribe);
      }
    });

    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [processingPostIds, isSocketReady, subscribeToSocket, findAllPosts]);

  const handleFiltersChange = useCallback(
    (newFilters: IFiltersState) => {
      setFilters(newFilters);

      const params = new URLSearchParams(searchParamsString);

      const statusValue = Array.isArray(newFilters.status)
        ? newFilters.status[0] || ''
        : newFilters.status;

      if (scope !== PageScope.SUPERADMIN && statusValue === PostStatus.DRAFT) {
        params.delete('status');
      } else if (statusValue) {
        params.set('status', statusValue);
      } else {
        params.delete('status');
      }

      if (newFilters.search) {
        params.set('search', newFilters.search);
      } else {
        params.delete('search');
      }

      if (newFilters.sort && newFilters.sort !== 'createdAt: -1') {
        params.set('sort', newFilters.sort);
      } else {
        params.delete('sort');
      }

      params.delete('page');

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      router.replace(newUrl, { scroll: false });
    },
    [pathname, router, searchParamsString, scope],
  );

  const sortOptions = useMemo(
    () => [
      { label: 'Newest First', value: 'createdAt: -1' },
      { label: 'Oldest First', value: 'createdAt: 1' },
      { label: 'Scheduled (Latest)', value: 'scheduledDate: -1' },
      { label: 'Scheduled (Earliest)', value: 'scheduledDate: 1' },
    ],
    [],
  );

  useEffect(() => {
    if (toolbarSearchValue === filterSearch) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      handleFiltersChange({
        ...filters,
        search: toolbarSearchValue,
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [toolbarSearchValue, filterSearch, filters, handleFiltersChange]);

  const handleGenerate = useCallback(
    async (
      prompt: string,
      count?: number,
      selectedPlatform?: Platform,
      isThread?: boolean,
    ) => {
      await generatePosts({
        availablePlatforms,
        count,
        getCredentialForPlatform: getCredentialForCurrentPlatform,
        getPostsService,
        isThread,
        onGeneratingChange: setIsGenerating,
        onRefresh: async () => {
          await findAllPosts();
        },
        platform,
        prompt,
        selectedPlatform,
      });
    },
    [
      platform,
      availablePlatforms,
      getCredentialForCurrentPlatform,
      getPostsService,
      findAllPosts,
    ],
  );

  const handlePlatformChange = useCallback(
    (newPlatform: Platform | 'all') => {
      const params = new URLSearchParams(searchParamsString);

      if (newPlatform === 'all') {
        params.delete('platform');
      } else {
        params.set('platform', newPlatform);
      }

      params.delete('page');

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      router.replace(newUrl, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParamsString);
      if (page <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(page));
      }
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  const handlePublicationStateChange = useCallback(
    (nextView: PublishingPostsView) => {
      const params = new URLSearchParams(searchParamsString);
      params.delete('page');
      params.delete(PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE);
      params.delete(PUBLISHING_POSTS_QUERY_KEYS.STATUS);

      if (nextView === 'posted' || nextView === 'not-posted') {
        params.set(PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE, nextView);
      } else {
        params.set(PUBLISHING_POSTS_QUERY_KEYS.STATUS, nextView);
      }

      const queryString = params.toString();
      const destination = queryString
        ? `${APP_ROUTES.PUBLISHING.POSTS}?${queryString}`
        : APP_ROUTES.PUBLISHING.POSTS;

      router.replace(href(destination), { scroll: false });
    },
    [href, router, searchParamsString],
  );

  return {
    actions,
    adminBrand,
    adminOrg,
    availablePlatforms,
    browserTimezone,
    columns,
    currentPage,
    filterSearch,
    filterSort,
    filters,
    findAllPosts,
    handleAdminBrandChange,
    handleAdminOrgChange,
    handleFiltersChange,
    handleGenerate,
    handleOpenPostDetail,
    handlePageChange,
    handlePlatformChange,
    handlePublicationStateChange,
    handlePostEvaluated,
    isGenerating,
    isLoading,
    pagination,
    platform,
    postPresets,
    posts,
    primaryCardAction,
    publicationState,
    scope,
    secondaryCardActions,
    selectedPostId,
    setFiltersNode,
    setSelectedPostId,
    setToolbarSearchValue,
    setViewToggleNode,
    setViewType,
    sortOptions,
    status,
    toolbarSearchValue,
    viewType,
  };
}
