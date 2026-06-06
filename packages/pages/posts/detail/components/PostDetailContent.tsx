'use client';

import { PageScope, type Platform } from '@genfeedai/enums';
import type {
  IIngredient,
  IPost,
  PostQuickActionKey,
} from '@genfeedai/interfaces';
import PostDetailPostList from '@pages/posts/detail/components/PostDetailPostList';
import PostDetailThreadExtras from '@pages/posts/detail/components/PostDetailThreadExtras';
import type { PostsService } from '@services/content/posts.service';
import type { NotificationsService } from '@services/core/notifications.service';
import ThreadPreviewPanel from '@ui/posts/preview/thread-preview-panel/ThreadPreviewPanel';
import type React from 'react';

export interface PostDetailContentProps {
  post: IPost;
  sortedChildren: IPost[];
  scope: PageScope;
  viewMode: 'edit' | 'preview';

  // Draft values
  descriptionDraft: string;
  labelDraft: string;
  childDescriptions: Map<string, string>;
  selectedIngredients: IIngredient[];

  // State
  focusedPostId: string | null;
  draggedPostId: string | null;
  dragOverDividerIndex: number | null;
  enhancingPostId: string | null;
  enhancingAction: PostQuickActionKey | null;
  isSavingIngredients: boolean;
  isSavingDescription: boolean;
  isTogglingGrok: boolean;
  isTogglingFirstComment: boolean;

  // Computed
  carouselValidation: { valid: boolean; errors: string[] };
  publishedDisplay: string;
  isContentDirty: boolean;
  canAddThread: boolean;
  canAddFirstComment: boolean;
  hasFirstComment: boolean;
  firstCommentPost: IPost | null;
  isLastChildGrokTweet: boolean;
  hasChildren: boolean;

  setDescriptionDraft: (value: string) => void;
  setLabelDraft: (value: string) => void;
  setChildDescription: (childId: string, value: string) => void;
  setFocusedPostId: (id: string | null) => void;
  setDragOverDividerIndex: (index: number | null) => void;
  handleContentSave: () => Promise<void>;
  handleAddToThread: () => Promise<void>;
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
  ) => Promise<void>;
  handlePerTweetEnhance: (postId: string, prompt: string) => Promise<void>;
  handleDragStart: (postId: string) => void;
  handleDragEnd: () => void;
  handleDrop: (targetPostId: string, targetOrder: number) => Promise<void>;
  handleToggleGrokFeedback: (checked: boolean) => Promise<void>;
  handleToggleFirstComment: (checked: boolean) => Promise<void>;
  handleUpdateChild: (childId: string, updates: Partial<IPost>) => void;

  // Auto-save refs
  autoSaveRefs: {
    currentDescriptions: React.MutableRefObject<Map<string, string>>;
    lastSavedDescriptions: React.MutableRefObject<Map<string, string>>;
    currentLabels: React.MutableRefObject<Map<string, string>>;
    lastSavedLabels: React.MutableRefObject<Map<string, string>>;
    timeouts: React.MutableRefObject<Map<string, NodeJS.Timeout>>;
  };
  performAutoSaveForPost: (postId: string) => Promise<void>;

  // Services
  getPostsService: () => Promise<PostsService>;
  notificationsService: NotificationsService;
}

export default function PostDetailContent({
  post,
  sortedChildren,
  scope,
  viewMode,
  descriptionDraft,
  labelDraft,
  childDescriptions,
  selectedIngredients,
  focusedPostId,
  dragOverDividerIndex,
  enhancingPostId,
  enhancingAction,
  isSavingIngredients,
  isSavingDescription,
  isTogglingGrok,
  isTogglingFirstComment,
  carouselValidation,
  publishedDisplay,
  isContentDirty,
  canAddThread,
  canAddFirstComment,
  hasFirstComment,
  firstCommentPost,
  isLastChildGrokTweet,
  hasChildren,
  setDescriptionDraft,
  setLabelDraft,
  setChildDescription,
  setFocusedPostId,
  setDragOverDividerIndex,
  handleContentSave,
  handleAddToThread,
  handleDeleteChild,
  handleSelectMedia,
  handleGenerateIllustration,
  handleQuickAction,
  handlePerTweetEnhance,
  handleDragStart,
  handleDragEnd,
  handleDrop,
  handleToggleGrokFeedback,
  handleToggleFirstComment,
  handleUpdateChild,
  autoSaveRefs,
  performAutoSaveForPost,
  getPostsService,
  notificationsService,
}: PostDetailContentProps) {
  const isEditable = scope === PageScope.PUBLISHER;

  // Preview mode - clean read-only view
  if (viewMode === 'preview') {
    return (
      <ThreadPreviewPanel
        parent={{ content: descriptionDraft, id: post.id }}
        replies={sortedChildren.map((c) => ({
          content: c.description || '',
          id: c.id,
        }))}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PostDetailPostList
        post={post}
        sortedChildren={sortedChildren}
        scope={scope}
        descriptionDraft={descriptionDraft}
        labelDraft={labelDraft}
        childDescriptions={childDescriptions}
        selectedIngredients={selectedIngredients}
        focusedPostId={focusedPostId}
        dragOverDividerIndex={dragOverDividerIndex}
        enhancingPostId={enhancingPostId}
        enhancingAction={enhancingAction}
        isSavingIngredients={isSavingIngredients}
        isSavingDescription={isSavingDescription}
        carouselValidation={carouselValidation}
        publishedDisplay={publishedDisplay}
        isContentDirty={isContentDirty}
        canAddThread={canAddThread}
        isLastChildGrokTweet={isLastChildGrokTweet}
        hasChildren={hasChildren}
        setDescriptionDraft={setDescriptionDraft}
        setLabelDraft={setLabelDraft}
        setChildDescription={setChildDescription}
        setFocusedPostId={setFocusedPostId}
        setDragOverDividerIndex={setDragOverDividerIndex}
        handleContentSave={handleContentSave}
        handleAddToThread={handleAddToThread}
        handleDeleteChild={handleDeleteChild}
        handleSelectMedia={handleSelectMedia}
        handleGenerateIllustration={handleGenerateIllustration}
        handleQuickAction={handleQuickAction}
        handlePerTweetEnhance={handlePerTweetEnhance}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        handleDrop={handleDrop}
        handleUpdateChild={handleUpdateChild}
        autoSaveRefs={autoSaveRefs}
        performAutoSaveForPost={performAutoSaveForPost}
        getPostsService={getPostsService}
        notificationsService={notificationsService}
      />

      {/* Thread extras - only in Publisher scope */}
      {isEditable && (canAddThread || canAddFirstComment) && (
        <PostDetailThreadExtras
          canAddThread={canAddThread}
          canAddFirstComment={canAddFirstComment}
          isLastChildGrokTweet={isLastChildGrokTweet}
          isTogglingGrok={isTogglingGrok}
          isTogglingFirstComment={isTogglingFirstComment}
          hasFirstComment={hasFirstComment}
          firstCommentPost={firstCommentPost}
          childDescriptions={childDescriptions}
          handleToggleGrokFeedback={handleToggleGrokFeedback}
          handleToggleFirstComment={handleToggleFirstComment}
          handleUpdateChild={handleUpdateChild}
          setChildDescription={setChildDescription}
          performAutoSaveForPost={performAutoSaveForPost}
          autoSaveRefs={autoSaveRefs}
        />
      )}
    </div>
  );
}
