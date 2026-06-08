'use client';

import { CredentialPlatform, PageScope, Platform } from '@genfeedai/enums';
import type {
  IIngredient,
  IPost,
  PostQuickActionKey,
} from '@genfeedai/interfaces';
import PostDetailCard from '@pages/posts/detail/components/PostDetailCard';
import type { PostsService } from '@services/content/posts.service';
import type { NotificationsService } from '@services/core/notifications.service';
import type React from 'react';

const VIDEO_ONLY_PLATFORMS: Platform[] = [Platform.YOUTUBE, Platform.TIKTOK];

export interface PostDetailPostListProps {
  post: IPost;
  sortedChildren: IPost[];
  scope: PageScope;
  descriptionDraft: string;
  labelDraft: string;
  childDescriptions: Map<string, string>;
  selectedIngredients: IIngredient[];
  focusedPostId: string | null;
  dragOverDividerIndex: number | null;
  enhancingPostId: string | null;
  enhancingAction: PostQuickActionKey | null;
  isSavingIngredients: boolean;
  isSavingDescription: boolean;
  carouselValidation: { valid: boolean; errors: string[] };
  publishedDisplay: string;
  isContentDirty: boolean;
  canAddThread: boolean;
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
  handleUpdateChild: (childId: string, updates: Partial<IPost>) => void;
  autoSaveRefs: {
    currentDescriptions: React.MutableRefObject<Map<string, string>>;
    lastSavedDescriptions: React.MutableRefObject<Map<string, string>>;
    currentLabels: React.MutableRefObject<Map<string, string>>;
    lastSavedLabels: React.MutableRefObject<Map<string, string>>;
    timeouts: React.MutableRefObject<Map<string, NodeJS.Timeout>>;
  };
  performAutoSaveForPost: (postId: string) => Promise<void>;
  getPostsService: () => Promise<PostsService>;
  notificationsService: NotificationsService;
}

export default function PostDetailPostList({
  post,
  sortedChildren,
  scope,
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
  carouselValidation,
  publishedDisplay,
  isContentDirty,
  canAddThread,
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
  handleUpdateChild,
  autoSaveRefs,
  performAutoSaveForPost,
  getPostsService,
  notificationsService,
}: PostDetailPostListProps) {
  const isEditable = scope === PageScope.PUBLISHER;
  const allPosts = [post, ...sortedChildren];
  const platform =
    (post.platform as CredentialPlatform) || CredentialPlatform.TWITTER;

  return (
    <>
      {allPosts.map((currentPost, index) => {
        const isParent = index === 0;
        const isLastPost = index === allPosts.length - 1;
        const isSecondToLast = index === allPosts.length - 2;

        const isGrokTweet =
          currentPost.description?.trim().startsWith('@grok') ?? false;
        const shouldShowAdd = isParent
          ? !hasChildren
          : (isLastPost && !isGrokTweet) ||
            (isSecondToLast && isLastChildGrokTweet);

        return (
          <div key={currentPost.id}>
            {/* Divider before each child (for drag-drop) */}
            {isEditable && !isParent && (
              <div
                className={`h-px my-2 transition-all duration-200 ${
                  dragOverDividerIndex === index - 2
                    ? 'h-1 bg-primary/30'
                    : 'bg-border hover:bg-muted/50'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverDividerIndex(index - 2);
                }}
                onDragLeave={() => {
                  setDragOverDividerIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverDividerIndex(null);
                  const postIdFromDrop = e.dataTransfer.getData(
                    'application/x-post-reorder',
                  );
                  if (postIdFromDrop) {
                    handleDrop(currentPost.id, currentPost.order || index + 1);
                  }
                }}
              />
            )}

            <PostDetailCard
              post={currentPost}
              index={index}
              scope={scope}
              platform={platform}
              isDraggable={!isParent}
              focusedPostId={focusedPostId}
              setFocusedPostId={setFocusedPostId}
              descriptionValue={
                isParent
                  ? descriptionDraft
                  : (childDescriptions.get(currentPost.id) ??
                    currentPost.description ??
                    '')
              }
              onDescriptionChange={(value) => {
                if (isParent) {
                  setDescriptionDraft(value);
                  if (currentPost?.id) {
                    autoSaveRefs.currentDescriptions.current.set(
                      currentPost.id,
                      value,
                    );
                  }
                } else {
                  autoSaveRefs.currentDescriptions.current.set(
                    currentPost.id,
                    value,
                  );
                  setChildDescription(currentPost.id, value);
                }
              }}
              labelValue={isParent ? labelDraft : undefined}
              onLabelChange={
                isParent
                  ? (value) => {
                      setLabelDraft(value);
                      if (currentPost?.id) {
                        autoSaveRefs.currentLabels.current.set(
                          currentPost.id,
                          value,
                        );
                      }
                    }
                  : undefined
              }
              selectedMedia={
                isParent
                  ? selectedIngredients
                  : ((currentPost.ingredients || []) as IIngredient[])
              }
              carouselValidation={isParent ? carouselValidation : undefined}
              publishedDisplay={isParent ? publishedDisplay : undefined}
              showAnalytics={isParent}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              getPostsService={getPostsService}
              onUpdateChild={handleUpdateChild}
              notificationsService={notificationsService}
              canAddThread={canAddThread}
              onAddToThread={handleAddToThread}
              isLast={shouldShowAdd}
              onDeleteChild={!isParent ? handleDeleteChild : undefined}
              onQuickAction={handleQuickAction}
              onPromptEnhance={handlePerTweetEnhance}
              enhancingPostId={enhancingPostId}
              enhancingAction={enhancingAction}
              performAutoSaveForPost={performAutoSaveForPost}
              currentDescriptionsRef={autoSaveRefs.currentDescriptions}
              currentLabelsRef={autoSaveRefs.currentLabels}
              lastSavedDescriptionsRef={autoSaveRefs.lastSavedDescriptions}
              lastSavedLabelsRef={autoSaveRefs.lastSavedLabels}
              autoSaveTimeoutsRef={autoSaveRefs.timeouts}
              onGenerateIllustration={
                platform && !VIDEO_ONLY_PLATFORMS.includes(platform as Platform)
                  ? (postId: string, prompt: string) =>
                      handleGenerateIllustration(
                        postId,
                        prompt,
                        platform as Platform,
                      )
                  : undefined
              }
              onSelectMedia={() =>
                handleSelectMedia(
                  currentPost.id,
                  isParent
                    ? selectedIngredients
                    : ((currentPost.ingredients || []) as IIngredient[]),
                )
              }
              isSavingMedia={isParent ? isSavingIngredients : false}
              onSave={isParent ? handleContentSave : () => {}}
              isDirty={isParent ? isContentDirty : false}
              isSaving={isParent ? isSavingDescription : false}
            />
          </div>
        );
      })}
    </>
  );
}
