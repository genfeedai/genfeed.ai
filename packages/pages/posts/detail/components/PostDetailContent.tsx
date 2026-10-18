'use client';

import {
  CredentialPlatform,
  PageScope,
  type Platform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IIngredient,
  IPost,
  PostQuickActionKey,
} from '@genfeedai/contracts/interfaces';
import { getPostsPlatformLabel } from '@helpers/content/posts.helper';
import { plainTextToHtml } from '@helpers/security/sanitize-html.helper';
import PostDetailPostList from '@pages/posts/detail/components/PostDetailPostList';
import PostDetailThreadFooter from '@pages/posts/detail/components/PostDetailThreadFooter';
import type { PostsService } from '@services/content/posts.service';
import type { NotificationsService } from '@services/core/notifications.service';
import PostComposerPromptBar from '@ui/posts/composer-prompt-bar/PostComposerPromptBar';
import type { TweetTone } from '@ui/posts/composer-prompt-bar/PostComposerPromptBar.props';
import ThreadPreviewPanel from '@ui/posts/preview/thread-preview-panel/ThreadPreviewPanel';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

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
  firstCommentPost: IPost | null;
  isLastChildGrokTweet: boolean;

  setDescriptionDraft: (value: string) => void;
  setLabelDraft: (value: string) => void;
  setChildDescription: (childId: string, value: string) => void;
  setFocusedPostId: (id: string | null) => void;
  setDragOverDividerIndex: (index: number | null) => void;
  handleContentSave: () => Promise<void>;
  handleAddToThread: () => Promise<void>;
  handleAddThreadPosts: (descriptions: string[]) => Promise<void>;
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
    tone?: TweetTone,
  ) => Promise<string | null>;
  handlePerTweetEnhance: (
    postId: string,
    prompt: string,
    tone?: TweetTone,
  ) => Promise<string | null>;
  handleDraftThread: (
    postId: string,
    tone?: TweetTone,
  ) => Promise<string[] | null>;
  handleDragStart: (postId: string) => void;
  handleDragEnd: () => void;
  handleDrop: (targetPostId: string, targetOrder: number) => Promise<void>;
  handleToggleGrokFeedback: (
    checked: boolean,
    question?: string,
  ) => Promise<void>;
  handleSetGrokQuestion: (question: string) => Promise<void>;
  handleToggleFirstComment: (checked: boolean) => Promise<void>;
  handleUpdateChild: (childId: string, updates: Partial<IPost>) => void;

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

function contentLabel(platform: IPost['platform']): string {
  switch (platform) {
    case CredentialPlatform.TIKTOK:
    case CredentialPlatform.INSTAGRAM:
      return 'Caption';
    case CredentialPlatform.YOUTUBE:
      return 'Description';
    default:
      return 'Post';
  }
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
  isSavingIngredients,
  isSavingDescription,
  isTogglingGrok,
  isTogglingFirstComment,
  carouselValidation,
  publishedDisplay,
  isContentDirty,
  canAddThread,
  canAddFirstComment,
  firstCommentPost,
  isLastChildGrokTweet,
  setDescriptionDraft,
  setLabelDraft,
  setChildDescription,
  setFocusedPostId,
  setDragOverDividerIndex,
  handleContentSave,
  handleAddToThread,
  handleAddThreadPosts,
  handleDeleteChild,
  handleSelectMedia,
  handleGenerateIllustration,
  handleQuickAction,
  handlePerTweetEnhance,
  handleDraftThread,
  handleDragStart,
  handleDragEnd,
  handleDrop,
  handleToggleGrokFeedback,
  handleSetGrokQuestion,
  handleToggleFirstComment,
  handleUpdateChild,
  autoSaveRefs,
  performAutoSaveForPost,
  getPostsService,
  notificationsService,
}: PostDetailContentProps) {
  const isPublished =
    Boolean(post.publicationDate) ||
    post.targetExecutionState === TargetExecutionState.PUBLISHED;
  const isEditable = scope === PageScope.PUBLISHING;
  const isTwitter = post.platform === CredentialPlatform.TWITTER;

  // The first comment hangs off the thread footer, not the post list.
  const threadChildren = useMemo(
    () =>
      firstCommentPost
        ? sortedChildren.filter((child) => child.id !== firstCommentPost.id)
        : sortedChildren,
    [sortedChildren, firstCommentPost],
  );
  const threadPosts = useMemo(
    () => [post, ...threadChildren],
    [post, threadChildren],
  );

  // The prompt bar acts on the post you last worked in; focusing the bar
  // itself clears `focusedPostId`, so remember the last post separately.
  const [targetPostId, setTargetPostId] = useState(post.id);
  useEffect(() => {
    if (
      focusedPostId &&
      threadPosts.some((item) => item.id === focusedPostId)
    ) {
      setTargetPostId(focusedPostId);
    }
  }, [focusedPostId, threadPosts]);

  const targetIndex = Math.max(
    0,
    threadPosts.findIndex((item) => item.id === targetPostId),
  );
  const target = threadPosts[targetIndex] ?? post;
  const isTargetParent = targetIndex === 0;
  const targetContent = isTargetParent
    ? descriptionDraft
    : (childDescriptions.get(target.id) ?? target.description ?? '');
  const targetLabel = isTwitter
    ? `Post ${targetIndex + 1}`
    : contentLabel(post.platform);

  const lastChild = sortedChildren.at(-1);
  const grokQuestion =
    isLastChildGrokTweet && lastChild
      ? (childDescriptions.get(lastChild.id) ?? lastChild.description ?? null)
      : null;

  const applyRewrite = (text: string) => {
    const html = plainTextToHtml(text);
    autoSaveRefs.currentDescriptions.current.set(target.id, html);
    if (isTargetParent) {
      setDescriptionDraft(html);
    } else {
      setChildDescription(target.id, html);
    }
  };

  // Preview mode - clean read-only view
  if (viewMode === 'preview') {
    return (
      <ThreadPreviewPanel
        parent={{
          content: descriptionDraft,
          id: post.id,
          media: selectedIngredients,
        }}
        replies={threadChildren.map((c) => ({
          content: c.description || '',
          id: c.id,
          media: (c.ingredients ?? []) as IIngredient[],
        }))}
      />
    );
  }

  const isComposing = isEditable && !isPublished;

  return (
    <div className="space-y-4">
      <PostDetailPostList
        post={post}
        sortedChildren={threadChildren}
        scope={scope}
        descriptionDraft={descriptionDraft}
        labelDraft={labelDraft}
        childDescriptions={childDescriptions}
        selectedIngredients={selectedIngredients}
        focusedPostId={focusedPostId}
        dragOverDividerIndex={dragOverDividerIndex}
        isSavingIngredients={isSavingIngredients}
        isSavingDescription={isSavingDescription}
        carouselValidation={carouselValidation}
        publishedDisplay={publishedDisplay}
        isContentDirty={isContentDirty}
        setDescriptionDraft={setDescriptionDraft}
        setLabelDraft={setLabelDraft}
        setChildDescription={setChildDescription}
        setFocusedPostId={setFocusedPostId}
        setDragOverDividerIndex={setDragOverDividerIndex}
        handleContentSave={handleContentSave}
        handleDeleteChild={handleDeleteChild}
        handleSelectMedia={handleSelectMedia}
        handleGenerateIllustration={handleGenerateIllustration}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        handleDrop={handleDrop}
        handleUpdateChild={handleUpdateChild}
        autoSaveRefs={autoSaveRefs}
        performAutoSaveForPost={performAutoSaveForPost}
        getPostsService={getPostsService}
        notificationsService={notificationsService}
      />

      {isComposing ? (
        <PostDetailThreadFooter
          canAddThread={canAddThread}
          canAddFirstComment={canAddFirstComment}
          isLastChildGrokTweet={isLastChildGrokTweet}
          grokQuestion={grokQuestion}
          isTogglingGrok={isTogglingGrok}
          isTogglingFirstComment={isTogglingFirstComment}
          firstCommentPost={firstCommentPost}
          childDescriptions={childDescriptions}
          handleAddToThread={handleAddToThread}
          handleToggleGrokFeedback={handleToggleGrokFeedback}
          handleSetGrokQuestion={handleSetGrokQuestion}
          handleToggleFirstComment={handleToggleFirstComment}
          handleUpdateChild={handleUpdateChild}
          setChildDescription={setChildDescription}
          performAutoSaveForPost={performAutoSaveForPost}
          autoSaveRefs={autoSaveRefs}
        />
      ) : null}

      {isComposing ? (
        <PostComposerPromptBar
          targetLabel={targetLabel}
          targetContent={targetContent}
          platformLabel={
            post.platform ? getPostsPlatformLabel(post.platform) : 'social'
          }
          isBusy={enhancingPostId !== null}
          canDraftThread={isTwitter && threadChildren.length === 0}
          canEndWithGrok={isTwitter && !isLastChildGrokTweet}
          canAddFirstComment={canAddFirstComment && !firstCommentPost}
          onRewrite={(prompt, actionKey, tone) =>
            actionKey
              ? handleQuickAction(target.id, prompt, actionKey, tone)
              : handlePerTweetEnhance(target.id, prompt, tone)
          }
          onApplyRewrite={applyRewrite}
          onDraftThread={(tone) => handleDraftThread(post.id, tone)}
          onAddThreadPosts={handleAddThreadPosts}
          onEndWithGrok={() => void handleToggleGrokFeedback(true)}
          onAddFirstComment={() => void handleToggleFirstComment(true)}
        />
      ) : null}
    </div>
  );
}
