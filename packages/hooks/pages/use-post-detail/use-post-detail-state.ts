'use client';

import {
  CredentialPlatform,
  IngredientFormat,
  PageScope,
  Platform,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import type { ICredential, IPost } from '@genfeedai/interfaces';
import type { AnalyticsStat } from '@genfeedai/interfaces/analytics/analytics-ui.interface';
import { PostsService } from '@genfeedai/services/content/posts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { validateCarouselCount } from '@genfeedai/utils/carousel-validation';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiArrowTrendingUp,
  HiBolt,
  HiChatBubbleLeftRight,
  HiEye,
  HiHeart,
} from 'react-icons/hi2';

export const GROK_FEEDBACK_QUESTIONS = [
  '@grok What are your thoughts on this thread?',
  '@grok Curious to hear your perspective. What do you think?',
  '@grok Would appreciate your insights. Any feedback?',
  "@grok What's your take on this?",
];

export const FIRST_COMMENT_PLACEHOLDER =
  'Add your first comment here... This will be posted as the first comment on your video/post.';

export const PLATFORM_FORMAT_MAP: Partial<Record<Platform, IngredientFormat>> =
  {
    [Platform.TWITTER]: IngredientFormat.LANDSCAPE,
    [Platform.INSTAGRAM]: IngredientFormat.SQUARE,
    [Platform.FACEBOOK]: IngredientFormat.LANDSCAPE,
    [Platform.LINKEDIN]: IngredientFormat.LANDSCAPE,
    [Platform.PINTEREST]: IngredientFormat.PORTRAIT,
    [Platform.REDDIT]: IngredientFormat.LANDSCAPE,
    [Platform.MEDIUM]: IngredientFormat.LANDSCAPE,
  };

export function getFormatForPlatform(platform?: Platform): IngredientFormat {
  if (!platform) {
    return IngredientFormat.LANDSCAPE;
  }
  return PLATFORM_FORMAT_MAP[platform] ?? IngredientFormat.LANDSCAPE;
}

export interface UsePostDetailStateOptions {
  postId: string;
  scope: PageScope;
}

export interface UsePostDetailStateReturn {
  // Navigation
  pathname: string;
  router: ReturnType<typeof useRouter>;

  // Services
  getPostsService: () => Promise<PostsService>;
  notificationsService: NotificationsService;

  // Core state
  post: IPost | null;
  setPost: React.Dispatch<React.SetStateAction<IPost | null>>;
  error: string | null;
  isLoading: boolean;
  credential: ICredential | undefined;

  // View state
  viewMode: 'edit' | 'preview';
  setViewMode: (mode: 'edit' | 'preview') => void;
  focusedPostId: string | null;
  setFocusedPostId: (id: string | null) => void;

  // Status flags
  isUpdating: boolean;
  setIsUpdating: React.Dispatch<React.SetStateAction<boolean>>;
  isSavingIngredients: boolean;
  setIsSavingIngredients: React.Dispatch<React.SetStateAction<boolean>>;
  isSavingDescription: boolean;
  setIsSavingDescription: React.Dispatch<React.SetStateAction<boolean>>;
  isSavingSchedule: boolean;
  setIsSavingSchedule: React.Dispatch<React.SetStateAction<boolean>>;
  enhancingPostId: string | null;
  setEnhancingPostId: React.Dispatch<React.SetStateAction<string | null>>;
  enhancingAction: string | null;
  setEnhancingAction: React.Dispatch<React.SetStateAction<string | null>>;
  isTogglingGrok: boolean;
  setIsTogglingGrok: React.Dispatch<React.SetStateAction<boolean>>;
  isTogglingFirstComment: boolean;
  setIsTogglingFirstComment: React.Dispatch<React.SetStateAction<boolean>>;
  isExpandingToThread: boolean;
  setIsExpandingToThread: React.Dispatch<React.SetStateAction<boolean>>;
  generatingChildPostIds: Set<string>;
  setGeneratingChildPostIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  hasInitiatedExpansionRef: React.RefObject<boolean>;

  // Computed
  sortedChildren: IPost[];
  hasChildren: boolean;
  isPublished: boolean;
  isEditable: boolean;
  canAddThread: boolean;
  canAddFirstComment: boolean;
  hasFirstComment: boolean;
  firstCommentPost: IPost | null;
  isLastChildGrokTweet: boolean;
  publishedDisplay: string;
  analyticsStats: AnalyticsStat[];
  carouselValidation: { valid: boolean; errors: string[] };

  // Fetch
  fetchPost: (isRefresh?: boolean) => Promise<void>;

  // Update helpers
  updateActivePost: (
    updates: Partial<IPost>,
    successMessage?: string,
    silent?: boolean,
  ) => Promise<IPost | null>;
  handleUpdateChild: (childId: string, updates: Partial<IPost>) => void;
  updateDescriptionRefs: (refPostId: string, description: string) => void;
  updateLabelRefs: (refPostId: string, label: string) => void;
}

export function usePostDetailState({
  postId,
  scope,
}: UsePostDetailStateOptions): UsePostDetailStateReturn {
  const pathname = usePathname();
  const router = useRouter();

  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();

  // Core state
  const [post, setPost] = useState<IPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // View state
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [focusedPostId, setFocusedPostId] = useState<string | null>(null);

  // Status flags
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSavingIngredients, setIsSavingIngredients] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [enhancingPostId, setEnhancingPostId] = useState<string | null>(null);
  const [enhancingAction, setEnhancingAction] = useState<string | null>(null);
  const [isTogglingGrok, setIsTogglingGrok] = useState(false);
  const [isTogglingFirstComment, setIsTogglingFirstComment] = useState(false);
  const [isExpandingToThread, setIsExpandingToThread] = useState(false);
  const [generatingChildPostIds, setGeneratingChildPostIds] = useState<
    Set<string>
  >(new Set());
  const hasInitiatedExpansionRef = useRef(false);

  // Preserve credential during refreshes to prevent flash to null
  const [cachedCredential, setCachedCredential] = useState<
    ICredential | undefined
  >(undefined);

  // Ref-based description/label tracking for auto-save
  const lastSavedDescriptionsRef = useRef<Map<string, string>>(new Map());
  const currentDescriptionsRef = useRef<Map<string, string>>(new Map());
  const lastSavedLabelsRef = useRef<Map<string, string>>(new Map());
  const currentLabelsRef = useRef<Map<string, string>>(new Map());

  // Computed values
  const sortedChildren = useMemo(() => post?.children || [], [post?.children]);
  const hasChildren = sortedChildren.length > 0;

  const isPublished = useMemo(
    () => !!(post?.publicationDate || post?.status === PostStatus.PUBLIC),
    [post?.publicationDate, post?.status],
  );

  const isEditable = useMemo(
    () => scope === PageScope.PUBLISHER && !isPublished,
    [scope, isPublished],
  );

  // Use cached credential to prevent flash during refreshes
  const credential = useMemo(() => {
    const currentCredential = post?.credential as ICredential | undefined;
    if (currentCredential) {
      return currentCredential;
    }
    return cachedCredential;
  }, [post?.credential, cachedCredential]);

  // Update cached credential when post has a valid credential
  useEffect(() => {
    const postCredential = post?.credential as ICredential | undefined;
    if (postCredential) {
      setCachedCredential(postCredential);
    }
  }, [post?.credential]);

  const canAddThread =
    post?.platform === CredentialPlatform.TWITTER && Boolean(post);

  const canAddFirstComment =
    (post?.platform === CredentialPlatform.YOUTUBE ||
      post?.platform === CredentialPlatform.INSTAGRAM ||
      post?.platform === CredentialPlatform.LINKEDIN ||
      post?.platform === CredentialPlatform.FACEBOOK ||
      post?.platform === CredentialPlatform.REDDIT) &&
    Boolean(post);

  const hasFirstComment = useMemo(() => {
    if (!canAddFirstComment) {
      return false;
    }
    return sortedChildren.some(
      (child) => (child as IPost).category === PostCategory.TEXT,
    );
  }, [sortedChildren, canAddFirstComment]);

  const firstCommentPost = useMemo(() => {
    if (!canAddFirstComment) {
      return null;
    }
    return (
      (sortedChildren.find(
        (child) => (child as IPost).category === PostCategory.TEXT,
      ) as IPost | null) ?? null
    );
  }, [sortedChildren, canAddFirstComment]);

  const isLastChildGrokTweet = useMemo(() => {
    if (sortedChildren.length === 0) {
      return false;
    }
    const lastChild = sortedChildren[sortedChildren.length - 1];
    return lastChild?.description?.trim().startsWith('@grok') ?? false;
  }, [sortedChildren]);

  const publishedDisplay = post?.publicationDate
    ? formatDate(post.publicationDate, DATE_FORMATS.SHORT_DATETIME)
    : '';

  const carouselValidation = useMemo(() => {
    const ingredients = post?.ingredients || [];
    if (!post?.credential?.platform || ingredients.length === 0) {
      return { errors: [] as string[], valid: true };
    }

    return validateCarouselCount(
      [post.credential.platform],
      ingredients.length,
    );
  }, [post?.credential?.platform, post?.ingredients]);

  const analyticsStats = useMemo<AnalyticsStat[]>(() => {
    if (!post) {
      return [];
    }

    const baseViews = post.totalViews ?? 0;
    const likes = post.totalLikes;
    const comments = post.totalComments;
    const shares = post.totalShares;
    const engagementRate = post.avgEngagementRate;

    const stats: Array<AnalyticsStat | null> = [
      {
        accent: 'text-primary',
        icon: HiEye,
        label: 'Views',
        value: formatCompactNumber(baseViews),
      },
      likes === undefined
        ? null
        : {
            accent: 'text-rose-500',
            icon: HiHeart,
            label: 'Likes',
            value: formatCompactNumber(likes),
          },
      comments === undefined
        ? null
        : {
            accent: 'text-secondary',
            icon: HiChatBubbleLeftRight,
            label: 'Comments',
            value: formatCompactNumber(comments),
          },
      shares === undefined
        ? null
        : {
            accent: 'text-warning',
            icon: HiBolt,
            label: 'Shares',
            value: formatCompactNumber(shares),
          },
      engagementRate === undefined
        ? null
        : {
            accent: 'text-success',
            icon: HiArrowTrendingUp,
            label: 'Engagement',
            value: `${(engagementRate * 100).toFixed(1)}%`,
          },
    ];

    return stats.filter((item): item is AnalyticsStat => item !== null);
  }, [post]);

  const updateDescriptionRefs = useCallback(
    (refPostId: string, description: string) => {
      currentDescriptionsRef.current.set(refPostId, description);
      lastSavedDescriptionsRef.current.set(refPostId, description);
    },
    [],
  );

  const updateLabelRefs = useCallback((refPostId: string, label: string) => {
    currentLabelsRef.current.set(refPostId, label);
    lastSavedLabelsRef.current.set(refPostId, label);
  }, []);

  // Fetch post
  const fetchPost = useCallback(
    async (isRefresh: boolean = false) => {
      const url = `GET /posts/${postId}`;

      try {
        if (!isRefresh) {
          setIsLoading(true);
        }
        setError(null);

        const service = await getPostsService();
        const data = await service.findOne(postId);
        logger.info(`${url} successful`, data);

        if (isRefresh) {
          setPost((prevPost) => ({
            ...data,
            credential: data.credential ?? prevPost?.credential,
          }));
        } else {
          setPost(data);
        }
      } catch (err: unknown) {
        logger.error('Failed to fetch post', err);
        const message =
          err instanceof Error ? err.message : 'Failed to load post';
        setError(message);
      } finally {
        if (!isRefresh) {
          setIsLoading(false);
        }
      }
    },
    [postId, getPostsService],
  );

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  // Sync view mode based on publication status
  useEffect(() => {
    if (!post) {
      return;
    }

    const isPostPublished =
      post.publicationDate || post.status === PostStatus.PUBLIC;
    if (isPostPublished && viewMode !== 'preview') {
      setViewMode('preview');
    }
  }, [post?.id, post?.publicationDate, post?.status, viewMode, post]);

  // Update active post handler
  const updateActivePost = useCallback(
    async (
      updates: Partial<IPost>,
      successMessage?: string,
      silent: boolean = false,
    ) => {
      if (!post || isUpdating) {
        return null;
      }

      const url = `PATCH /posts/${post.id}`;
      setIsUpdating(true);

      try {
        const service = await getPostsService();
        const updatedPost = await service.patch(
          post.id,
          updates as Partial<
            import('@genfeedai/models/content/post.model').Post
          >,
        );

        logger.info(`${url} success`, updatedPost);
        if (!silent) {
          notificationsService.success(
            successMessage || 'Post updated successfully',
          );
        }

        if (updates.description !== undefined && post.id) {
          updateDescriptionRefs(post.id, updatedPost.description ?? '');
        }
        if (updates.label !== undefined && post.id) {
          updateLabelRefs(post.id, updatedPost.label ?? '');
        }

        setPost((prevPost) => ({
          ...updatedPost,
          children: updatedPost.children ?? prevPost?.children ?? [],
          credential: updatedPost.credential ?? prevPost?.credential,
        }));

        return updatedPost;
      } catch (updateError) {
        logger.error(`${url} failed`, updateError);
        if (!silent) {
          notificationsService.error('Failed to update post');
        }
        throw updateError;
      } finally {
        setIsUpdating(false);
      }
    },
    [
      post,
      isUpdating,
      getPostsService,
      notificationsService,
      updateDescriptionRefs,
      updateLabelRefs,
    ],
  );

  // Update child handler
  const handleUpdateChild = useCallback(
    (childId: string, updates: Partial<IPost>) => {
      setPost((prevPost) => {
        if (!prevPost?.children) {
          return prevPost;
        }
        return {
          ...prevPost,
          children: prevPost.children.map((child) =>
            child.id === childId ? { ...child, ...updates } : child,
          ),
        };
      });
    },
    [],
  );

  return {
    analyticsStats,
    canAddFirstComment,
    canAddThread,
    carouselValidation,
    credential,
    enhancingAction,
    enhancingPostId,
    error,
    fetchPost,
    firstCommentPost,
    focusedPostId,
    generatingChildPostIds,
    getPostsService,
    handleUpdateChild,
    hasChildren,
    hasFirstComment,
    hasInitiatedExpansionRef,
    isEditable,
    isExpandingToThread,
    isLastChildGrokTweet,
    isLoading,
    isPublished,
    isSavingDescription,
    isSavingIngredients,
    isSavingSchedule,
    isTogglingFirstComment,
    isTogglingGrok,
    isUpdating,
    notificationsService,
    pathname,
    post,
    publishedDisplay,
    router,
    setEnhancingAction,
    setEnhancingPostId,
    setFocusedPostId,
    setGeneratingChildPostIds,
    setIsExpandingToThread,
    setIsSavingDescription,
    setIsSavingIngredients,
    setIsSavingSchedule,
    setIsTogglingFirstComment,
    setIsTogglingGrok,
    setIsUpdating,
    setPost,
    setViewMode,
    sortedChildren,
    updateActivePost,
    updateDescriptionRefs,
    updateLabelRefs,
    viewMode,
  };
}
