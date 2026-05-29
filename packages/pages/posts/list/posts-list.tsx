'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { EMPTY_STATES, ITEMS_PER_PAGE } from '@genfeedai/constants';
import {
  ModelCategory,
  PageScope,
  type Platform,
  PostStatus,
  ViewType,
  WebSocketEventStatus,
} from '@genfeedai/enums';
import type { IIngredient, IPost, IPreset } from '@genfeedai/interfaces';
import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import { normalizePostsPlatform } from '@helpers/content/posts.helper';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import { buildPostsCardActions } from '@pages/posts/list/components/PostsCardActions';
import PostsGrid from '@pages/posts/list/components/PostsGrid';
import PostsListToolbar from '@pages/posts/list/components/PostsListToolbar';
import { buildPostsTableActions } from '@pages/posts/list/components/PostsTableActions';
import { buildPostsTableColumns } from '@pages/posts/list/components/PostsTableColumns';
import {
  getAvailablePlatforms,
  getCredentialForPlatform,
} from '@pages/posts/list/components/posts-credential.helpers';
import { generatePosts } from '@pages/posts/list/components/posts-generate.helpers';
import { fetchPosts } from '@pages/posts/list/components/posts-query.helpers';
import type { ContentProps } from '@props/layout/content.props';
import {
  useConfirmDeleteModal,
  useIngredientOverlay,
  usePostMetadataOverlay,
  usePostRemixModal,
} from '@providers/global-modals/global-modals.provider';
import { PagesService } from '@services/content/pages.service';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { PresetsService } from '@services/elements/presets.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import Loading from '@ui/loading/default/Loading';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import PromptBarPost from '@ui/prompt-bars/post/PromptBarPost';
import PromptBarSurfaceRenderer from '@ui/prompt-bars/surface/PromptBarSurfaceRenderer';
import { POSTS_PROMPT_BAR_SURFACE } from '@ui/prompt-bars/surface/prompt-bar-surface.config';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiSquares2X2, HiTableCells } from 'react-icons/hi2';

// View type constants
const VIEW_TYPE_GRID = ViewType.GRID;
const VIEW_TYPE_TABLE = ViewType.TABLE;

const getDefaultSort = (status?: PostStatus): string => {
  if (status === PostStatus.SCHEDULED) {
    return 'scheduledDate: 1';
  }
  if (status === PostStatus.PUBLIC) {
    return 'scheduledDate: -1';
  }
  return 'createdAt: -1';
};

export interface PostsListProps extends ContentProps {
  initialPostPresets?: IPreset[];
  initialPosts?: IPost[];
  platform?: string;
  status?: PostStatus;
}

export default function PostsList({
  initialPostPresets,
  initialPosts,
  scope,
  platform: platformParam,
  status: statusProp,
}: PostsListProps) {
  const hydratedPostPresets = initialPostPresets ?? [];
  const hydratedPosts = initialPosts ?? [];

  // Normalize platform from URL (e.g., "youtube", "instagram", "all")
  const platform = normalizePostsPlatform(platformParam);

  const platformFilter = platform !== 'all' ? platform : undefined;

  const { brandId, organizationId, isReady, credentials } = useBrand();

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

  // Admin org/brand filter state (superadmin only)
  const [adminOrg, setAdminOrg] = useState(
    () => parsedSearchParams.get('organization') || '',
  );
  const [adminBrand, setAdminBrand] = useState(
    () => parsedSearchParams.get('brand') || '',
  );

  const { openIngredientOverlay } = useIngredientOverlay();
  const { openPostMetadataOverlay } = usePostMetadataOverlay();
  const { openConfirmDelete } = useConfirmDeleteModal();
  const { openPostRemixModal } = usePostRemixModal();

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

  // Ref to track current posts for functional updates
  const postsRef = useRef<IPost[]>([]);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const { setRefresh, setViewToggleNode } = usePostsLayout();

  // View type state - default to grid for publisher (PUBLISHER), table for analytics (ANALYTICS/SUPERADMIN)
  const [viewType, setViewType] = useState<ViewType>(() => {
    // Default to grid for publisher app (PUBLISHER scope), table for analytics/other scopes
    if (scope === PageScope.PUBLISHER) {
      return VIEW_TYPE_GRID;
    }

    // Default to table for analytics, superadmin, and other scopes
    return VIEW_TYPE_TABLE;
  });

  // Pass ViewToggle to layout header
  useEffect(() => {
    setViewToggleNode(
      <ViewToggle
        options={[
          {
            icon: <HiSquares2X2 />,
            label: 'Card View',
            type: VIEW_TYPE_GRID,
          },
          {
            icon: <HiTableCells />,
            label: 'Table View',
            type: VIEW_TYPE_TABLE,
          },
        ]}
        activeView={viewType}
        onChange={setViewType}
      />,
    );
    return () => setViewToggleNode(null);
  }, [viewType, setViewToggleNode]);

  // WebSocket manager for listening to post status updates
  const { isReady: isSocketReady, subscribe: subscribeToSocket } =
    useSocketManager();

  const searchQueryParam = parsedSearchParams.get('search') || '';
  const sortQueryParam =
    parsedSearchParams.get('sort') || getDefaultSort(status);

  // Filter state using FiltersBar pattern
  const [filters, setFilters] = useState<IFiltersState>(() => ({
    format: '',
    provider: '',
    search: searchQueryParam,
    sort: sortQueryParam,
    status: status || '',
    type: '',
  }));

  // Sync filters when URL params change (e.g., browser back/forward)
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

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(parsedSearchParams.get('page')) || 1;

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

  // Extract individual filter values for stable dependencies
  const filterSearch = filters.search;
  const filterStatus = Array.isArray(filters.status)
    ? filters.status[0]
    : filters.status;
  const filterSort = filters.sort;

  const queryClient = useQueryClient();

  const postsQueryKey = [
    'posts-list',
    scope,
    brandId,
    organizationId,
    platformFilter,
    filterSearch,
    filterStatus,
    filterSort,
    currentPage,
    status,
    adminOrg,
    adminBrand,
  ] as const;

  const {
    data: posts = [],
    isLoading,
    refetch: refreshPosts,
    error: postsError,
  } = useQuery<IPost[]>({
    enabled: scope === PageScope.SUPERADMIN || isReady,
    initialData: initialPosts != null ? hydratedPosts : undefined,
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
        scope,
        status,
      }),
    queryKey: postsQueryKey,
  });

  useEffect(() => {
    if (postsError instanceof Error) {
      logger.error('GET /posts failed', postsError);
    }
  }, [postsError]);

  const setPosts = (updatedPosts: IPost[]) => {
    queryClient.setQueryData(postsQueryKey, updatedPosts);
  };

  const findAllPosts = () => refreshPosts();

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  // Load post presets (only for PUBLISHER scope where PromptBarPost is shown)
  const loadPostPresets = useCallback(async () => {
    if (scope !== PageScope.PUBLISHER || initialPostPresets !== undefined) {
      return;
    }

    try {
      const presetsService = await getPresetsService();
      if (!presetsService) {
        return;
      }

      const presetsData = (await presetsService.findAll({
        category: ModelCategory.TEXT,
        limit: ITEMS_PER_PAGE,
        pagination: false,
      })) as IPreset[];

      // Filter to post presets only (platform filtering happens in PromptBarPost)
      setPostPresets(
        presetsData.filter((preset) =>
          preset.key.startsWith('preset.text.post.'),
        ),
      );
    } catch (error) {
      logger.error('Failed to load post presets', error);
    }
  }, [scope, getPresetsService, initialPostPresets]);

  // Load presets on mount (only for PUBLISHER scope)
  useEffect(() => {
    setPostPresets(hydratedPostPresets);
  }, [hydratedPostPresets]);

  useEffect(() => {
    loadPostPresets();
  }, [loadPostPresets]);

  // Callback to update a post's evalScore after evaluation
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

  // Track previous platform and status to detect actual changes
  const prevPlatformRef = useRef(platform);
  const prevStatusRef = useRef(status);

  // Reset pagination when platform or status changes (not when page changes)
  useEffect(() => {
    const platformChanged = prevPlatformRef.current !== platform;
    const statusChanged = prevStatusRef.current !== status;

    prevPlatformRef.current = platform;
    prevStatusRef.current = status;

    if (platformChanged || statusChanged) {
      PagesService.setTotalPages(1);
      PagesService.setTotalDocs(0);
      PagesService.setCurrentPage(1);

      const params = new URLSearchParams(searchParamsString);
      params.delete('page');

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      router.replace(newUrl, { scroll: false });
    }
  }, [platform, status, pathname, router, searchParamsString]);

  const hasPublicPosts = useMemo(
    () => posts.some((post) => post.status === PostStatus.PUBLIC),
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

  const handleEditPost = useCallback(
    (post: IPost) => {
      openPostMetadataOverlay(post, () => findAllPosts());
    },
    [findAllPosts, openPostMetadataOverlay],
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
        router.push(href(`/posts/${remixPost.id}`));
      });
    },
    [getPostsService, notificationsService, openPostRemixModal, router, href],
  );

  // Table columns configuration - memoized to prevent unnecessary re-renders
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

  // Table actions configuration - memoized to prevent unnecessary re-renders
  const actions = useMemo(
    () =>
      buildPostsTableActions({
        onDelete: handleDelete,
        onEdit: handleEditPost,
        onOpenPlatformUrl: handleOpenPlatformUrl,
        onRemix: handleRemixPost,
        onViewIngredient: handleViewIngredient,
        scope,
      }),
    [
      scope,
      handleDelete,
      handleEditPost,
      handleOpenPlatformUrl,
      handleRemixPost,
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
        onViewIngredient: handleViewIngredient,
        scope,
      }),
    [
      editableStatuses,
      handleDelete,
      handleEditPost,
      handleOpenPlatformUrl,
      handleRemixPost,
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

  // WebSocket listener for post status updates
  // Only recreate subscriptions when processing post IDs change
  const processingPostIds = useMemo(
    () =>
      posts
        .filter((post) => post.status === PostStatus.PROCESSING)
        .map((post) => post.id)
        .sort(),
    [posts],
  );

  useEffect(() => {
    if (!isSocketReady || processingPostIds.length === 0) {
      return;
    }

    const unsubscribes: Array<() => void> = [];

    // Subscribe to WebSocket events for each PROCESSING post
    processingPostIds.forEach((postId) => {
      // Use publication method which maps to /posts/:id
      const postEventPath = WebSocketPaths.publication(postId);
      const unsubscribe = subscribeToSocket(
        postEventPath,
        (data: { status: string; result?: IPost; error?: string }) => {
          if (
            data.status === WebSocketEventStatus.COMPLETED ||
            data.status === WebSocketEventStatus.FAILED
          ) {
            // Refresh the list when a post status changes
            findAllPosts();
          }
        },
      );
      if (unsubscribe) {
        unsubscribes.push(unsubscribe);
      }
    });

    // Cleanup subscriptions on unmount or when processing post IDs change
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
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

  return (
    <div className={scope === PageScope.PUBLISHER ? 'pb-24 md:pb-32' : ''}>
      {/* Admin Org/Brand Filter (superadmin only) */}
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

      <PostsListToolbar
        searchValue={toolbarSearchValue}
        sortValue={filterSort || getDefaultSort(status)}
        sortOptions={sortOptions}
        onSearchChange={setToolbarSearchValue}
        onSortChange={(sortValue) =>
          handleFiltersChange({
            ...filters,
            sort: sortValue,
          })
        }
      />

      {isLoading && posts.length === 0 ? (
        <Loading isFullSize={false} />
      ) : (
        <>
          {viewType === VIEW_TYPE_GRID ? (
            <PostsGrid
              posts={posts}
              onPostEvaluated={handlePostEvaluated}
              onOpenPostDetail={handleOpenPostDetail}
              primaryAction={primaryCardAction}
              secondaryActions={secondaryCardActions}
            />
          ) : (
            <AppTable<IPost>
              items={posts}
              columns={columns}
              actions={actions}
              getRowKey={(post) => post.id}
              isLoading={isLoading}
              emptyLabel={EMPTY_STATES.POSTS_FOUND}
              onRowClick={handleOpenPostDetail}
            />
          )}

          <div className="mt-4">
            <AutoPagination showTotal totalLabel="posts" />
          </div>
        </>
      )}

      {/* Promptbar - Only show for Publisher app */}
      {scope === PageScope.PUBLISHER && (
        <PromptBarSurfaceRenderer
          surface={POSTS_PROMPT_BAR_SURFACE}
          topContent={<LowCreditsBanner />}
        >
          <PromptBarPost
            onSubmit={handleGenerate}
            isEnhancing={isGenerating}
            showCountDropdown={true}
            showThreadToggle={true}
            buttonLabel="Generate"
            platform={platform}
            onPlatformChange={handlePlatformChange}
            availablePlatforms={availablePlatforms}
            presets={postPresets}
          />
        </PromptBarSurfaceRenderer>
      )}

      <PostDetailOverlay
        postId={selectedPostId}
        scope={scope}
        onClose={() => setSelectedPostId(null)}
      />
    </div>
  );
}
