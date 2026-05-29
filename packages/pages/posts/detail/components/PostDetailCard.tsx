'use client';

import type { PostDetailCardProps } from '@props/components/post-detail-card.props';
import PostEnhancementBar from '@ui/posts/enhancement-bar/post-enhancement-bar/PostEnhancementBar';
import PostDetailCardBody from './PostDetailCardBody';
import { usePostDetailCard } from './usePostDetailCard';

export default function PostDetailCard({
  post,
  index,
  scope,
  platform,
  isDraggable = false,
  focusedPostId,
  setFocusedPostId,
  descriptionValue,
  onDescriptionChange,
  labelValue,
  onLabelChange,
  selectedMedia,
  carouselValidation,
  publishedDisplay,
  showAnalytics,
  onDragStart,
  onDragEnd,
  getPostsService,
  onUpdateChild,
  notificationsService,
  canAddThread,
  onAddToThread,
  isLast,
  onDeleteChild,
  onQuickAction,
  onPromptEnhance,
  enhancingPostId,
  enhancingAction,
  performAutoSaveForPost,
  currentDescriptionsRef,
  currentLabelsRef,
  lastSavedDescriptionsRef,
  autoSaveTimeoutsRef,
  onGenerateIllustration,
  onSelectMedia,
  isSavingMedia,
  onSave,
  isDirty,
  isSaving,
}: PostDetailCardProps) {
  const {
    isEditable,
    isParent,
    localIngredients,
    isSavingLocal,
    isGrokTweet,
    isTwitter,
    placeholder,
    hasAnalytics,
    handleSaveDescription,
    openDeleteConfirm,
  } = usePostDetailCard({
    post,
    index,
    scope,
    platform,
    descriptionValue,
    getPostsService,
    onUpdateChild,
    notificationsService,
    onDeleteChild,
    currentDescriptionsRef,
    currentLabelsRef,
    lastSavedDescriptionsRef,
    autoSaveTimeoutsRef,
    performAutoSaveForPost,
  });

  return (
    <div
      draggable={isEditable && isDraggable && !isGrokTweet}
      className={`transition-opacity duration-200 ${focusedPostId === null || focusedPostId === post.id ? 'opacity-100' : 'opacity-80'}`}
      onFocus={() => setFocusedPostId(post.id)}
      onBlur={() => setFocusedPostId(null)}
      onDragStart={(e) => {
        if (!isEditable || isGrokTweet || !isDraggable) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }

        const target = e.target as HTMLElement;
        if (
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'BUTTON' ||
          target.closest('button') ||
          target.closest('textarea') ||
          target.closest('[contenteditable="true"]') ||
          target.closest('.ProseMirror') ||
          target.closest('[role="textbox"]')
        ) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-post-reorder', post.id);
        onDragStart(post.id);
      }}
      onDragEnd={() => {
        onDragEnd();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <PostDetailCardBody
        post={post}
        index={index}
        focusedPostId={focusedPostId}
        isEditable={isEditable}
        isParent={isParent}
        isTwitter={isTwitter}
        placeholder={placeholder}
        descriptionValue={descriptionValue}
        onDescriptionChange={onDescriptionChange}
        currentDescriptionsRef={currentDescriptionsRef}
        labelValue={labelValue}
        onLabelChange={onLabelChange}
        currentLabelsRef={currentLabelsRef}
        localIngredients={localIngredients}
        carouselValidation={carouselValidation}
        publishedDisplay={publishedDisplay}
        hasAnalytics={hasAnalytics}
        showAnalytics={showAnalytics}
      />

      {/* Enhancement bar - only shown in Publisher scope */}
      {isEditable && onQuickAction && onPromptEnhance && (
        <PostEnhancementBar
          key={post.id}
          postId={post.id}
          onQuickAction={onQuickAction}
          onPromptEnhance={onPromptEnhance}
          isEnhancing={enhancingPostId === post.id}
          enhancingAction={
            enhancingPostId === post.id ? (enhancingAction ?? null) : null
          }
          hasContent={!!descriptionValue.trim()}
          placeholder={
            isParent
              ? 'Describe how to enhance this tweet...'
              : `Describe how to enhance tweet ${index + 1}...`
          }
          className=""
          selectedMedia={isParent ? selectedMedia : localIngredients}
          onSelectMedia={
            onSelectMedia
              ? () =>
                  onSelectMedia(
                    post.id,
                    isParent ? selectedMedia : localIngredients,
                  )
              : undefined
          }
          isSavingMedia={isParent ? isSavingMedia : isSavingLocal}
          onSave={isParent ? onSave : handleSaveDescription}
          isDirty={
            isParent
              ? isDirty
              : (() => {
                  const currentDescFromRef = currentDescriptionsRef.current.get(
                    post.id,
                  );
                  const currentDesc =
                    currentDescFromRef ?? descriptionValue ?? '';
                  return currentDesc !== post.description;
                })()
          }
          isSaving={isParent ? isSaving : isSavingLocal}
          showAddPost={isLast && canAddThread && !isGrokTweet}
          onAddPost={onAddToThread}
          showDelete={!isParent}
          onDelete={!isParent ? openDeleteConfirm : undefined}
          onGenerateIllustration={
            onGenerateIllustration
              ? () => onGenerateIllustration(post.id, descriptionValue)
              : undefined
          }
          postContent={descriptionValue}
          postPlatform={platform}
          onInsertHashtag={(hashtag: string) => {
            const newValue = descriptionValue
              ? `${descriptionValue} ${hashtag}`
              : hashtag;
            onDescriptionChange(newValue);
            if (post?.id) {
              currentDescriptionsRef.current.set(post.id, newValue);
            }
          }}
          onAcceptCaption={(caption: string) => {
            onDescriptionChange(caption);
            if (post?.id) {
              currentDescriptionsRef.current.set(post.id, caption);
            }
          }}
        />
      )}
    </div>
  );
}
