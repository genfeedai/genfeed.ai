'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { EMPTY_STATES, ITEMS_PER_PAGE } from '@genfeedai/constants';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  CredentialPlatform,
  IngredientCategory,
  ModelCategory,
  PageScope,
  Platform,
  PostCategory,
  PostStatus,
  ViewType,
  WebSocketEventStatus,
} from '@genfeedai/enums';
import type {
  ICredential,
  IIngredient,
  IPost,
  IPreset,
  IQueryParams,
} from '@genfeedai/interfaces';
import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import {
  normalizePostsPlatform,
  PLATFORM_LABEL_MAP,
} from '@helpers/content/posts.helper';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useEvaluation } from '@hooks/ui/evaluation/use-evaluation/use-evaluation';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import PostsGrid, {
  type PostCardAction,
  postCardIcons,
} from '@pages/posts/list/components/PostsGrid';
import PostsListToolbar from '@pages/posts/list/components/PostsListToolbar';
import type { ContentProps } from '@props/layout/content.props';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import {
  useConfirmDeleteModal,
  useIngredientOverlay,
  usePostMetadataOverlay,
  usePostRemixModal,
} from '@providers/global-modals/global-modals.provider';
import { PagesService } from '@services/content/pages.service';
import { PostsService } from '@services/content/posts.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { PresetsService } from '@services/elements/presets.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import Badge from '@ui/display/badge/Badge';
import HtmlContent from '@ui/display/html-content/HtmlContent';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import AppTable from '@ui/display/table/Table';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import EvaluationBadge from '@ui/evaluation/badge/EvaluationBadge';
import Loading from '@ui/loading/default/Loading';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Button } from '@ui/primitives/button';
import PromptBarPost from '@ui/prompt-bars/post/PromptBarPost';
import PromptBarSurfaceRenderer from '@ui/prompt-bars/surface/PromptBarSurfaceRenderer';
import { POSTS_PROMPT_BAR_SURFACE } from '@ui/prompt-bars/surface/prompt-bar-surface.config';
import { WebSocketPaths } from '@utils/network/websocket.util';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiArrowTopRightOnSquare,
  HiArrowUp,
  HiDocumentDuplicate,
  HiEye,
  HiPencil,
  HiSquares2X2,
  HiTableCells,
  HiTrash,
} from 'react-icons/hi2';

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

// Eval cell component - handles evaluation button/badge for a single post
interface EvalCellProps {
  post: IPost;
  onEvaluated: (postId: string, score: number) => void;
}

function EvalCell({ post, onEvaluated }: EvalCellProps) {
  const { evaluation, isEvaluating, evaluate } = useEvaluation({
    autoFetch: false, // Don't auto-fetch - we already have evalScore from API
    contentId: post.id,
    contentType: 'post',
  });

  // If we have a score from the API or from a fresh evaluation, show badge
  const score = evaluation?.overallScore ?? post.evalScore;

  if (score != null) {
    return <EvaluationBadge score={score} size={ComponentSize.XS} />;
  }

  // No score - show evaluate button
  const handleEvaluate = async () => {
    try {
      const result = await evaluate();
      if (result?.overallScore != null) {
        onEvaluated(post.id, result.overallScore);
      }
    } catch {
      // Error already handled by useEvaluation hook
    }
  };

  return (
    <Button
      variant={ButtonVariant.GENERATE}
      icon={<HiArrowUp />}
      tooltip="Evaluate"
      isLoading={isEvaluating}
      onClick={handleEvaluate}
      size={ButtonSize.XS}
    />
  );
}

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

  // Load posts using useResource (handles data fetching with proper dependency tracking)
  const {
    data: posts,
    isLoading,
    refresh: refreshPosts,
    mutate: setPosts,
  } = useResource(
    async () => {
      let url = 'GET /posts';

      const query: IQueryParams & {
        platform?: string;
        status?: string;
        search?: string;
        sort?: string;
      } = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
      };

      if (platformFilter) {
        query.platform = platformFilter;
      }

      // Add status filter from filters state
      // For publisher app (PUBLISHER scope), exclude PUBLIC by default if no status filter is set
      if (scope === PageScope.PUBLISHER && !filterStatus && !status) {
        // Exclude PUBLIC status - we'll filter client-side after fetching
      } else if (filterStatus) {
        query.status = filterStatus;
      } else if (status) {
        // If status prop is provided (analytics app), use it
        query.status = status;
      }

      // Add search filter
      if (filterSearch) {
        query.search = filterSearch;
      }

      // Add sort filter
      if (filterSort) {
        query.sort = filterSort;
      }

      let data: IPost[] = [];

      // Load posts based on scope
      if (
        (scope === PageScope.BRAND || scope === PageScope.PUBLISHER) &&
        brandId
      ) {
        const service = await getBrandsService();
        url = `GET /brands/${brandId}/posts`;
        data = await service.findBrandPosts(brandId, query);
      } else if (scope === PageScope.ORGANIZATION && organizationId) {
        const service = await getOrganizationsService();
        url = `GET /organizations/${organizationId}/posts`;
        data = await service.findOrganizationPosts(organizationId, query);
      } else if (scope === PageScope.SUPERADMIN) {
        const service = await getPostsService();
        url = 'GET /posts';
        if (adminOrg) {
          query.organization = adminOrg;
        }
        if (adminBrand) {
          query.brand = adminBrand;
        }
        data = await service.findAll(query);
      } else if (!scope && organizationId) {
        // Default to organization scope
        const service = await getOrganizationsService();
        url = `GET /organizations/${organizationId}/posts`;
        data = await service.findOrganizationPosts(organizationId, query);
      } else {
        // Fallback to global (will likely require superadmin)
        const service = await getPostsService();
        data = await service.findAll(query);
      }

      logger.info(`${url} success`, data);

      // For publisher app (PUBLISHER scope), exclude PUBLIC posts by default if no status filter is set
      if (scope === PageScope.PUBLISHER && !filterStatus && !status) {
        return data.filter((post) => post.status !== PostStatus.PUBLIC);
      }

      return data;
    },
    {
      defaultValue: [] as IPost[],
      dependencies: [
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
      ],
      enabled: scope === PageScope.SUPERADMIN || isReady,
      initialData: hydratedPosts,
      onError: (error: Error) => {
        logger.error('GET /posts failed', error);
      },
      revalidateOnMount: initialPosts == null,
    },
  );

  // Local alias for callback wiring.
  const findAllPosts = refreshPosts;

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

  const getCredentialForPlatform = useCallback(
    (platform: Platform): ICredential | undefined => {
      // Map Platform enum to CredentialPlatform enum
      // Using Partial since not all platforms have corresponding credentials
      const platformMap: Partial<Record<Platform, CredentialPlatform>> = {
        [Platform.TWITTER]: CredentialPlatform.TWITTER,
        [Platform.INSTAGRAM]: CredentialPlatform.INSTAGRAM,
        [Platform.YOUTUBE]: CredentialPlatform.YOUTUBE,
        [Platform.TIKTOK]: CredentialPlatform.TIKTOK,
        [Platform.FACEBOOK]: CredentialPlatform.FACEBOOK,
        [Platform.LINKEDIN]: CredentialPlatform.LINKEDIN,
        [Platform.REDDIT]: CredentialPlatform.REDDIT,
        [Platform.DISCORD]: CredentialPlatform.DISCORD,
        [Platform.TELEGRAM]: CredentialPlatform.TELEGRAM,
        [Platform.TWITCH]: CredentialPlatform.TWITCH,
        [Platform.MEDIUM]: CredentialPlatform.MEDIUM,
        [Platform.PINTEREST]: CredentialPlatform.PINTEREST,
        // THREADS uses Instagram credentials
        [Platform.THREADS]: CredentialPlatform.INSTAGRAM,
      };

      const credentialPlatform = platformMap[platform];
      return credentials.find(
        (cred) => cred.platform === credentialPlatform && cred.isConnected,
      );
    },
    [credentials],
  );

  const availablePlatforms = useMemo(() => {
    const platforms: Platform[] = [];
    credentials.forEach((cred) => {
      if (!cred.isConnected) {
        return;
      }

      // Map CredentialPlatform back to Platform
      // Using Partial since not all CredentialPlatform values may have Platform equivalents
      const platformMap: Partial<Record<CredentialPlatform, Platform | null>> =
        {
          [CredentialPlatform.TWITTER]: Platform.TWITTER,
          [CredentialPlatform.INSTAGRAM]: Platform.INSTAGRAM,
          [CredentialPlatform.YOUTUBE]: Platform.YOUTUBE,
          [CredentialPlatform.TIKTOK]: Platform.TIKTOK,
          [CredentialPlatform.FACEBOOK]: Platform.FACEBOOK,
          [CredentialPlatform.LINKEDIN]: Platform.LINKEDIN,
          [CredentialPlatform.REDDIT]: Platform.REDDIT,
          [CredentialPlatform.DISCORD]: Platform.DISCORD,
          [CredentialPlatform.TELEGRAM]: Platform.TELEGRAM,
          [CredentialPlatform.TWITCH]: Platform.TWITCH,
          [CredentialPlatform.MEDIUM]: Platform.MEDIUM,
          [CredentialPlatform.PINTEREST]: Platform.PINTEREST,
        };

      const mappedPlatform = platformMap[cred.platform];
      if (mappedPlatform && !platforms.includes(mappedPlatform)) {
        platforms.push(mappedPlatform);
      }
    });
    return platforms;
  }, [credentials]);

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

  const getDimensions = (ingredient?: IIngredient): string => {
    if (!ingredient) {
      return '';
    }
    const width = ingredient.metadataWidth;
    const height = ingredient.metadataHeight;
    if (!width || !height) {
      return '';
    }
    return `${width}×${height}`;
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) {
      return '';
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const hasPublicPosts = useMemo(
    () => posts.some((post) => post.status === PostStatus.PUBLIC),
    [posts],
  );

  // Table columns configuration - memoized to prevent unnecessary re-renders
  const columns: TableColumn<IPost>[] = useMemo(
    () => [
      {
        className: 'w-20',
        header: '',
        key: 'thumbnail',
        render: (post: IPost) => {
          const ingredient = post.ingredients?.[0] as IIngredient;
          const isVideo = ingredient?.category === IngredientCategory.VIDEO;

          return (
            <div
              className="w-16 aspect-video overflow-hidden bg-background cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                if (ingredient) {
                  openIngredientOverlay(ingredient, () => findAllPosts());
                }
              }}
            >
              {isVideo ? (
                <VideoPlayer
                  src={ingredient?.ingredientUrl}
                  thumbnail={ingredient.thumbnailUrl}
                  config={{
                    controls: false,
                    loop: true,
                    muted: true,
                    playsInline: false,
                    preload: 'metadata',
                  }}
                />
              ) : (
                <Image
                  src={
                    ingredient?.ingredientUrl ||
                    `${EnvironmentService.assetsEndpoint}/placeholders/square.jpg`
                  }
                  alt={ingredient?.metadataLabel || 'Thumbnail'}
                  width={64}
                  height={36}
                  className="object-cover w-full h-full"
                />
              )}
            </div>
          );
        },
      },
      {
        className: 'max-w-md',
        header: 'Content',
        key: 'content',
        render: (post: IPost) => {
          const ingredient = post.ingredients?.[0] as IIngredient;
          const isVideo = post.category === PostCategory.VIDEO;
          const isTweet = post.platform === Platform.TWITTER;

          return (
            <div>
              <div className="font-semibold text-foreground">
                {isTweet && post.description ? (
                  <HtmlContent
                    content={post.description}
                    className="line-clamp-1"
                  />
                ) : ingredient ? (
                  <span
                    className="truncate cursor-pointer hover:text-primary transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      openIngredientOverlay(ingredient, () => findAllPosts());
                    }}
                  >
                    {ingredient.metadataLabel || 'Untitled'}
                  </span>
                ) : (
                  <span className="truncate">Untitled</span>
                )}
              </div>

              <div className="text-xs text-foreground/60 flex items-center gap-2 mt-1">
                <span className="capitalize">{post.category}</span>
                {getDimensions(ingredient) && (
                  <>
                    <span>•</span>
                    <span>{getDimensions(ingredient)}</span>
                  </>
                )}
                {isVideo && ingredient?.metadataDuration && (
                  <>
                    <span>•</span>
                    <span>{formatDuration(ingredient.metadataDuration)}</span>
                  </>
                )}
              </div>
            </div>
          );
        },
      },
      {
        header: 'Platform',
        key: 'platform',
        render: (post: IPost) => <PlatformBadge platform={post.platform} />,
      },
      {
        header: 'Status',
        key: 'status',
        render: (post: IPost) => {
          const editableStatuses = [
            PostStatus.DRAFT,
            PostStatus.SCHEDULED,
            PostStatus.UNLISTED,
            PostStatus.PRIVATE,
            PostStatus.PUBLIC,
          ];

          const isEditable = editableStatuses.includes(
            post.status as PostStatus,
          );

          if (isEditable) {
            // Use DropdownStatus for editable posts
            return (
              <DropdownStatus
                entity={post}
                onStatusChange={() => {
                  // Refresh posts list after status change
                  findAllPosts();
                }}
              />
            );
          }

          // Use static Badge for non-editable statuses (PROCESSING, FAILED)
          const displayStatus =
            post.status === PostStatus.UNLISTED ? 'UNLISTED' : post.status;
          return (
            <Badge status={post.status} className="text-xs">
              {displayStatus}
            </Badge>
          );
        },
      },
      {
        className: 'text-xs',
        header: 'Scheduled',
        key: 'scheduledDate',
        render: (p: IPost) =>
          p.scheduledDate
            ? formatDateInTimezone(p.scheduledDate, browserTimezone, 'short')
            : '-',
      },
      // Eval column - hidden in Analytics app
      ...(scope !== PageScope.ANALYTICS
        ? [
            {
              className: 'text-center w-20',
              header: 'Eval',
              key: 'evalScore',
              render: (post: IPost) => (
                <EvalCell post={post} onEvaluated={handlePostEvaluated} />
              ),
            },
          ]
        : []),
      ...(hasPublicPosts
        ? [
            {
              className: 'text-right',
              header: 'Views',
              key: 'views',
              render: (post: IPost) => (
                <span className="font-mono">
                  {formatNumberWithCommas(post.totalViews || 0)}
                </span>
              ),
            },
            {
              className: 'text-right',
              header: 'Likes',
              key: 'likes',
              render: (post: IPost) => (
                <span className="font-mono">
                  {formatNumberWithCommas(post.totalLikes || 0)}
                </span>
              ),
            },
            {
              className: 'text-right',
              header: 'Comments',
              key: 'comments',
              render: (post: IPost) => (
                <span className="font-mono">
                  {formatNumberWithCommas(post.totalComments || 0)}
                </span>
              ),
            },
            {
              className: 'text-right',
              header: 'Eng %',
              key: 'engagement',
              render: (post: IPost) => (
                <span className="font-mono">
                  {(post.avgEngagementRate || 0).toFixed(1)}%
                </span>
              ),
            },
          ]
        : []),
    ],
    [
      hasPublicPosts,
      browserTimezone,
      scope,
      handlePostEvaluated,
      openIngredientOverlay,
      findAllPosts,
      formatDuration,
      getDimensions,
    ],
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

  // Table actions configuration - memoized to prevent unnecessary re-renders
  const actions: TableAction<IPost>[] = useMemo(
    () =>
      scope !== PageScope.SUPERADMIN
        ? [
            {
              icon: () => <HiEye />,
              isVisible: (post: IPost) => {
                const hasIngredient =
                  post.ingredients && post.ingredients.length > 0;
                return hasIngredient && post.status !== PostStatus.PUBLIC;
              },
              onClick: handleViewIngredient,
              size: ButtonSize.SM,
              tooltip: 'View Ingredient',
              variant: ButtonVariant.SECONDARY,
            },
            {
              icon: () => <HiPencil />,
              isVisible: (post: IPost) => {
                const editableStatuses = [
                  PostStatus.SCHEDULED,
                  PostStatus.DRAFT,
                  PostStatus.FAILED,
                  PostStatus.PROCESSING,
                ];

                return editableStatuses.includes(post.status as PostStatus);
              },
              onClick: handleEditPost,
              size: ButtonSize.SM,
              tooltip: 'Edit Post',
              variant: ButtonVariant.DEFAULT,
            },
            {
              icon: () => <HiTrash />,
              isVisible: (post: IPost) => {
                // Show delete for draft posts (not published)
                return post.status !== PostStatus.PUBLIC;
              },
              onClick: (post: IPost) => handleDelete(post),
              size: ButtonSize.SM,
              tooltip: 'Delete',
              variant: ButtonVariant.DESTRUCTIVE,
            },
            {
              icon: () => <HiDocumentDuplicate />,
              isVisible: (post: IPost) => post.status === PostStatus.PUBLIC,
              onClick: handleRemixPost,
              size: ButtonSize.SM,
              tooltip: 'Create Remix',
              variant: ButtonVariant.DEFAULT,
            },
            {
              icon: () => <HiArrowTopRightOnSquare />,
              isVisible: (post: IPost) => !!post.platformUrl,
              onClick: handleOpenPlatformUrl,
              tooltip: 'View',
              variant: ButtonVariant.SECONDARY,
            },
          ]
        : [
            {
              icon: () => <HiArrowTopRightOnSquare />,
              isVisible: (post: IPost) => !!post.platformUrl,
              onClick: handleOpenPlatformUrl,
              tooltip: 'View',
              variant: ButtonVariant.SECONDARY,
            },
          ],
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

  const primaryCardAction = useMemo<PostCardAction | undefined>(
    () =>
      scope === PageScope.SUPERADMIN
        ? undefined
        : {
            icon: postCardIcons.edit,
            isVisible: (post: IPost) =>
              editableStatuses.includes(post.status as PostStatus),
            key: 'edit',
            label: 'Edit post',
            onClick: handleEditPost,
          },
    [editableStatuses, handleEditPost, scope],
  );

  const secondaryCardActions = useMemo<PostCardAction[]>(
    () =>
      scope !== PageScope.SUPERADMIN
        ? [
            {
              icon: postCardIcons.viewIngredient,
              isVisible: (post: IPost) =>
                Boolean(post.ingredients?.length) &&
                post.status !== PostStatus.PUBLIC,
              key: 'view-ingredient',
              label: 'View ingredient',
              onClick: handleViewIngredient,
            },
            {
              destructive: true,
              icon: postCardIcons.delete,
              isVisible: (post: IPost) => post.status !== PostStatus.PUBLIC,
              key: 'delete',
              label: 'Delete post',
              onClick: handleDelete,
            },
            {
              icon: postCardIcons.remix,
              isVisible: (post: IPost) => post.status === PostStatus.PUBLIC,
              key: 'remix',
              label: 'Create remix',
              onClick: handleRemixPost,
            },
            {
              icon: postCardIcons.viewPlatform,
              isVisible: (post: IPost) => Boolean(post.platformUrl),
              key: 'open-platform',
              label: 'Open on platform',
              onClick: handleOpenPlatformUrl,
            },
          ]
        : [
            {
              icon: postCardIcons.viewPlatform,
              isVisible: (post: IPost) => Boolean(post.platformUrl),
              key: 'open-platform',
              label: 'Open on platform',
              onClick: handleOpenPlatformUrl,
            },
          ],
    [
      handleDelete,
      handleOpenPlatformUrl,
      handleRemixPost,
      handleViewIngredient,
      scope,
    ],
  );

  // Register refresh function with layout context
  // Note: wrap in arrow function to prevent React from calling it as a functional update
  useEffect(() => {
    setRefresh(() => () => refreshPosts());
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
      // Use selected platform or current platform filter, default to first available
      const targetPlatform =
        selectedPlatform ||
        (platform !== 'all' ? platform : availablePlatforms[0]);

      if (!targetPlatform) {
        return alert('No platform selected. Please select a platform.');
      }

      const credential = getCredentialForPlatform(targetPlatform);
      if (!credential) {
        const platformLabel = PLATFORM_LABEL_MAP[targetPlatform];
        return alert(`No ${platformLabel} account connected for this brand`);
      }

      setIsGenerating(true);

      try {
        const postsService = await getPostsService();

        if (isThread) {
          // Generate cohesive thread
          await postsService.generateThread({
            count: count || 5,
            credential: credential.id,
            tone: 'professional',
            topic: prompt,
          });
        } else {
          // Generate individual tweets
          await postsService.generateTweets({
            count: count || 10,
            credential: credential.id,
            tone: 'professional',
            topic: prompt,
          });
        }

        // Refresh list immediately to show PROCESSING posts
        await findAllPosts();
      } catch (error) {
        logger.error('Failed to generate posts', error);
        alert('Failed to generate posts. Please try again.');
      } finally {
        setIsGenerating(false);
      }
    },
    [
      platform,
      availablePlatforms,
      getCredentialForPlatform,
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
