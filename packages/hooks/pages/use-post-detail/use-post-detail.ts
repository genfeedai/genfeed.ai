'use client';

import type { PageScope, Platform } from '@genfeedai/enums';
import type {
  ICredential,
  IIngredient,
  IPost,
  PostQuickActionKey,
} from '@genfeedai/interfaces';
import type { AnalyticsStat } from '@genfeedai/interfaces/analytics/analytics-ui.interface';
import type { PostsService } from '@genfeedai/services/content/posts.service';
import type { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { usePostDetailActions } from '@hooks/pages/use-post-detail/use-post-detail-actions';
import { usePostDetailDrafts } from '@hooks/pages/use-post-detail/use-post-detail-drafts';
import { usePostDetailMedia } from '@hooks/pages/use-post-detail/use-post-detail-media';
import { usePostDetailState } from '@hooks/pages/use-post-detail/use-post-detail-state';
import { usePostDetailThread } from '@hooks/pages/use-post-detail/use-post-detail-thread';

export interface UsePostDetailOptions {
  postId: string;
  scope: PageScope;
}

export interface UsePostDetailReturn {
  // State
  post: IPost | null;
  sortedChildren: IPost[];
  isLoading: boolean;
  error: string | null;
  credential: ICredential | undefined;

  // View state
  viewMode: 'edit' | 'preview';
  focusedPostId: string | null;

  // Draft values
  labelDraft: string;
  descriptionDraft: string;
  childDescriptions: Map<string, string>;
  scheduleDraft: string;

  // Media state
  selectedIngredients: IIngredient[];

  // Status flags
  isUpdating: boolean;
  isSavingDescription: boolean;
  isSavingSchedule: boolean;
  isSavingIngredients: boolean;
  enhancingPostId: string | null;
  enhancingAction: PostQuickActionKey | null;
  isTogglingGrok: boolean;
  isTogglingFirstComment: boolean;
  isExpandingToThread: boolean;

  // Computed
  isEditable: boolean;
  isPublished: boolean;
  analyticsStats: AnalyticsStat[];
  carouselValidation: { valid: boolean; errors: string[] };
  canAddThread: boolean;
  canAddFirstComment: boolean;
  hasFirstComment: boolean;
  firstCommentPost: IPost | null;
  isLastChildGrokTweet: boolean;
  hasChildren: boolean;
  publishedDisplay: string;
  isContentDirty: boolean;
  isScheduleDirty: boolean;

  // Drag state
  draggedPostId: string | null;
  dragOverDividerIndex: number | null;

  // Handlers
  handleContentSave: () => Promise<void>;
  handleScheduleSave: () => Promise<void>;
  handleAddToThread: () => Promise<void>;
  handleDeletePost: () => void;
  handleDeleteChild: (childId: string) => void;
  handleSelectMedia: (
    targetPostId: string,
    currentIngredients: IIngredient[],
  ) => void;
  handleGenerateIllustration: (
    postId: string,
    prompt: string,
    platform?: Platform,
  ) => void;
  handleQuickAction: (
    postId: string,
    prompt: string,
    actionKey: PostQuickActionKey,
    tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
  ) => Promise<void>;
  handlePerTweetEnhance: (
    postId: string,
    prompt: string,
    tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
  ) => Promise<void>;
  handleDragStart: (postId: string) => void;
  handleDragEnd: () => void;
  handleDrop: (targetPostId: string, targetOrder: number) => Promise<void>;
  handleToggleGrokFeedback: (checked: boolean) => Promise<void>;
  handleToggleFirstComment: (checked: boolean) => Promise<void>;
  handleUpdateChild: (childId: string, updates: Partial<IPost>) => void;
  handleExpandToThread: (count: 2 | 3 | 5) => Promise<void>;

  // Setters
  setViewMode: (mode: 'edit' | 'preview') => void;
  setFocusedPostId: (id: string | null) => void;
  setLabelDraft: (value: string) => void;
  setDescriptionDraft: (value: string) => void;
  setChildDescription: (childId: string, value: string) => void;
  setScheduleDraft: (value: string) => void;
  setDragOverDividerIndex: (index: number | null) => void;

  // Refs for auto-save
  autoSaveRefs: {
    currentDescriptions: React.RefObject<Map<string, string>>;
    lastSavedDescriptions: React.RefObject<Map<string, string>>;
    currentLabels: React.RefObject<Map<string, string>>;
    lastSavedLabels: React.RefObject<Map<string, string>>;
    timeouts: React.RefObject<Map<string, NodeJS.Timeout>>;
  };
  performAutoSaveForPost: (postId: string) => Promise<void>;

  // Services
  getPostsService: () => Promise<PostsService>;
  notificationsService: NotificationsService;

  // Refresh
  refreshPost: (isRefresh?: boolean) => Promise<void>;

  // Navigation
  pathname: string;
}

export function usePostDetail({
  postId,
  scope,
}: UsePostDetailOptions): UsePostDetailReturn {
  // 1. Core state, fetch, computed values
  const state = usePostDetailState({ postId, scope });

  // 2. Draft management, auto-save
  const drafts = usePostDetailDrafts({
    getPostsService: state.getPostsService,
    handleUpdateChild: state.handleUpdateChild,
    post: state.post,
    postId,
    scope,
    setPost: state.setPost,
    updateDescriptionRefs: state.updateDescriptionRefs,
    updateLabelRefs: state.updateLabelRefs,
  });

  // 3. Thread operations (add, reorder, drag, grok, first comment, expand)
  const thread = usePostDetailThread({
    canAddThread: state.canAddThread,
    fetchPost: state.fetchPost,
    firstCommentPost: state.firstCommentPost,
    generatingChildPostIds: state.generatingChildPostIds,
    getPostsService: state.getPostsService,
    hasInitiatedExpansionRef: state.hasInitiatedExpansionRef,
    isExpandingToThread: state.isExpandingToThread,
    isLastChildGrokTweet: state.isLastChildGrokTweet,
    notificationsService: state.notificationsService,
    post: state.post,
    setChildDescription: drafts.setChildDescription,
    setGeneratingChildPostIds: state.setGeneratingChildPostIds,
    setIsExpandingToThread: state.setIsExpandingToThread,
    setIsTogglingFirstComment: state.setIsTogglingFirstComment,
    setIsTogglingGrok: state.setIsTogglingGrok,
    setPost: state.setPost,
    sortedChildren: state.sortedChildren,
    updateDescriptionRefs: state.updateDescriptionRefs,
    updateLabelRefs: state.updateLabelRefs,
  });

  // 4. CRUD actions (save, delete, enhance)
  const actions = usePostDetailActions({
    descriptionDraft: drafts.descriptionDraft,
    fetchPost: state.fetchPost,
    getPostsService: state.getPostsService,
    handleUpdateChild: state.handleUpdateChild,
    isContentDirty: drafts.isContentDirty,
    isDescriptionDirty: drafts.isDescriptionDirty,
    isLabelDirty: drafts.isLabelDirty,
    isScheduleDirty: drafts.isScheduleDirty,
    labelDraft: drafts.labelDraft,
    notificationsService: state.notificationsService,
    post: state.post,
    router: state.router,
    scheduleDraft: drafts.scheduleDraft,
    setChildDescriptions: drafts.setChildDescription,
    setDescriptionDraft: drafts.setDescriptionDraft,
    setEnhancingAction: state.setEnhancingAction,
    setEnhancingPostId: state.setEnhancingPostId,
    setIsSavingDescription: state.setIsSavingDescription,
    setIsSavingSchedule: state.setIsSavingSchedule,
    setPost: state.setPost,
    updateActivePost: state.updateActivePost,
    updateDescriptionRefs: state.updateDescriptionRefs,
  });

  // 5. Media operations (gallery, illustration)
  const media = usePostDetailMedia({
    fetchPost: state.fetchPost,
    getPostsService: state.getPostsService,
    handleUpdateChild: state.handleUpdateChild,
    notificationsService: state.notificationsService,
    post: state.post,
    setIsSavingIngredients: state.setIsSavingIngredients,
    setPost: state.setPost,
    setSelectedIngredients: drafts.setSelectedIngredients,
    sortedChildren: state.sortedChildren,
  });

  return {
    analyticsStats: state.analyticsStats,
    autoSaveRefs: drafts.autoSaveRefs,
    canAddFirstComment: state.canAddFirstComment,
    canAddThread: state.canAddThread,
    carouselValidation: state.carouselValidation,
    childDescriptions: drafts.childDescriptions,
    credential: state.credential,
    descriptionDraft: drafts.descriptionDraft,
    draggedPostId: thread.draggedPostId,
    dragOverDividerIndex: thread.dragOverDividerIndex,
    enhancingAction: state.enhancingAction as PostQuickActionKey | null,
    enhancingPostId: state.enhancingPostId,
    error: state.error,
    firstCommentPost: state.firstCommentPost,
    focusedPostId: state.focusedPostId,
    getPostsService: state.getPostsService,
    handleAddToThread: thread.handleAddToThread,
    handleContentSave: actions.handleContentSave,
    handleDeleteChild: thread.handleDeleteChild,
    handleDeletePost: actions.handleDeletePost,
    handleDragEnd: thread.handleDragEnd,
    handleDragStart: thread.handleDragStart,
    handleDrop: thread.handleDrop,
    handleExpandToThread: thread.handleExpandToThread,
    handleGenerateIllustration: media.handleGenerateIllustration,
    handlePerTweetEnhance: actions.handlePerTweetEnhance,
    handleQuickAction: actions.handleQuickAction,
    handleScheduleSave: actions.handleScheduleSave,
    handleSelectMedia: media.handleSelectMedia,
    handleToggleFirstComment: thread.handleToggleFirstComment,
    handleToggleGrokFeedback: thread.handleToggleGrokFeedback,
    handleUpdateChild: state.handleUpdateChild,
    hasChildren: state.hasChildren,
    hasFirstComment: state.hasFirstComment,
    isContentDirty: drafts.isContentDirty,
    isEditable: state.isEditable,
    isExpandingToThread: state.isExpandingToThread,
    isLastChildGrokTweet: state.isLastChildGrokTweet,
    isLoading: state.isLoading,
    isPublished: state.isPublished,
    isSavingDescription: state.isSavingDescription,
    isSavingIngredients: state.isSavingIngredients,
    isSavingSchedule: state.isSavingSchedule,
    isScheduleDirty: drafts.isScheduleDirty,
    isTogglingFirstComment: state.isTogglingFirstComment,
    isTogglingGrok: state.isTogglingGrok,
    isUpdating: state.isUpdating,
    labelDraft: drafts.labelDraft,
    notificationsService: state.notificationsService,
    pathname: state.pathname,
    performAutoSaveForPost: drafts.performAutoSaveForPost,
    post: state.post,
    publishedDisplay: state.publishedDisplay,
    refreshPost: state.fetchPost,
    scheduleDraft: drafts.scheduleDraft,
    selectedIngredients: drafts.selectedIngredients,
    setChildDescription: drafts.setChildDescription,
    setDescriptionDraft: drafts.setDescriptionDraft,
    setDragOverDividerIndex: thread.setDragOverDividerIndex,
    setFocusedPostId: state.setFocusedPostId,
    setLabelDraft: drafts.setLabelDraft,
    setScheduleDraft: drafts.setScheduleDraft,
    setViewMode: state.setViewMode,
    sortedChildren: state.sortedChildren,
    viewMode: state.viewMode,
  };
}
