'use client';

import type { PostDetailCardProps } from '@props/components/post-detail-card.props';
import PostCardFooter from '@ui/posts/card-footer/PostCardFooter';
import PostDetailCardBody from './PostDetailCardBody';
import { usePostDetailCard } from './usePostDetailCard';

export default function PostDetailCard({
  post,
  index,
  scope,
  platform,
  isDraggable = false,
  isThread = false,
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
  onDeleteChild,
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

  const footerBar = isEditable ? (
    <PostCardFooter
      key={post.id}
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
          : (currentDescriptionsRef.current.get(post.id) ??
              descriptionValue ??
              '') !== post.description
      }
      isSaving={isParent ? isSaving : isSavingLocal}
      showDelete={!isParent}
      onDelete={!isParent ? openDeleteConfirm : undefined}
      onGenerateIllustration={
        onGenerateIllustration
          ? () => onGenerateIllustration(post.id, descriptionValue)
          : undefined
      }
    />
  ) : null;

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
        isThread={isThread}
        footer={footerBar}
      />
    </div>
  );
}
