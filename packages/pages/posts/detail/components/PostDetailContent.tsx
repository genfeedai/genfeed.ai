'use client';

import type { IIngredient, IPost } from '@genfeedai/interfaces';
import { CredentialPlatform, Platform } from '@genfeedai/enums';
import PostDetailCard from '@pages/posts/detail/components/PostDetailCard';
import type { PostsService } from '@services/content/posts.service';
import type { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import FormCheckbox from '@ui/forms/selectors/checkbox/form-checkbox/FormCheckbox';
import ThreadPreviewPanel from '@ui/posts/preview/thread-preview-panel/ThreadPreviewPanel';
import type { PostQuickActionKey } from '@ui/posts/quick-actions/post-quick-actions/PostQuickActions';
import { PageScope } from '@ui-constants/misc.constant';

const VIDEO_ONLY_PLATFORMS: Platform[] = [Platform.YOUTUBE, Platform.TIKTOK];

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
        children={sortedChildren.map((c) => ({
          content: c.description || '',
          id: c.id,
        }))}
      />
    );
  }

  // Edit mode for Publisher or Read-only for other scopes
  // Unified posts array: parent first, then children
  const allPosts = [post, ...sortedChildren];
  const platform =
    (post.platform as CredentialPlatform) || CredentialPlatform.TWITTER;

  return (
    <div className="space-y-4">
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

      {/* Thread extras - only in Publisher scope */}
      {isEditable && (canAddThread || canAddFirstComment) && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">
                Optional engagement boosts
              </p>
              <p className="font-semibold">Thread extras</p>
            </div>
          </div>

          {canAddThread && (
            <FormCheckbox
              name="grok-feedback-request"
              label={
                <div className="space-y-1">
                  <p className="font-medium">Tag @grok for feedback</p>
                  <p className="text-xs text-foreground/60">
                    Adds a closing tweet asking @grok for input using one of the
                    preset prompts.
                  </p>
                </div>
              }
              isChecked={isLastChildGrokTweet}
              isDisabled={isTogglingGrok}
              className="h-4 w-4 accent-primary"
              onChange={(e) => handleToggleGrokFeedback(e.target.checked)}
            />
          )}

          {canAddFirstComment && (
            <div className="space-y-2">
              <FormCheckbox
                name="first-comment"
                label={
                  <div className="space-y-1">
                    <p className="font-medium">Add first comment</p>
                    <p className="text-xs text-foreground/60">
                      Creates a first comment for supported platforms so you can
                      add context or links without editing the main post.
                    </p>
                  </div>
                }
                isChecked={hasFirstComment}
                isDisabled={isTogglingFirstComment}
                className="h-4 w-4 accent-primary"
                onChange={(e) => handleToggleFirstComment(e.target.checked)}
              />

              {hasFirstComment && firstCommentPost && (
                <LazyRichTextEditor
                  value={
                    childDescriptions.get(firstCommentPost.id) ??
                    firstCommentPost.description ??
                    ''
                  }
                  placeholder="Enter your first comment..."
                  minHeight={{ desktop: 150, mobile: 100 }}
                  onChange={(value) => {
                    handleUpdateChild(firstCommentPost.id, {
                      description: value,
                    });
                    autoSaveRefs.currentDescriptions.current.set(
                      firstCommentPost.id,
                      value,
                    );
                    setChildDescription(firstCommentPost.id, value);

                    const existingTimeout = autoSaveRefs.timeouts.current.get(
                      firstCommentPost.id,
                    );
                    if (existingTimeout) {
                      clearTimeout(existingTimeout);
                    }

                    const timeout = setTimeout(() => {
                      performAutoSaveForPost(firstCommentPost.id);
                    }, 3_000);

                    autoSaveRefs.timeouts.current.set(
                      firstCommentPost.id,
                      timeout,
                    );
                  }}
                />
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
