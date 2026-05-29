'use client';

import { CredentialPlatform, PageScope, PostStatus } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import type { PostDetailCardProps } from '@props/components/post-detail-card.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import PostEnhancementBar from '@ui/posts/enhancement-bar/post-enhancement-bar/PostEnhancementBar';
import { useEffect, useState } from 'react';
import PostDetailCardBody from './PostDetailCardBody';

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
  const { openConfirm } = useConfirmModal();
  const isEditable = scope === PageScope.PUBLISHER;
  const isParent = index === 0;

  const [localDescription, setLocalDescription] = useState(
    post.description || '',
  );

  const [localIngredients, setLocalIngredients] = useState(
    (post.ingredients || []) as IIngredient[],
  );

  const [isSavingLocal, setIsSavingLocal] = useState(false);

  // Sync local state with prop changes
  useEffect(() => {
    setLocalDescription(post.description || '');
    setLocalIngredients((post.ingredients || []) as IIngredient[]);
    if (post.description !== undefined) {
      currentDescriptionsRef.current.set(post.id, post.description || '');
    }
    if (post.label !== undefined) {
      currentLabelsRef.current.set(post.id, post.label || '');
    }
  }, [
    post.description,
    post.label,
    post.ingredients,
    post.id,
    currentDescriptionsRef,
    currentLabelsRef,
  ]);

  // Sync localDescription from descriptionValue prop (user input)
  useEffect(() => {
    if (descriptionValue !== undefined) {
      setLocalDescription(descriptionValue);
    }
  }, [descriptionValue]);

  // Auto-save effect (only in Publisher scope)
  useEffect(() => {
    if (!isEditable || !performAutoSaveForPost) {
      return;
    }

    const timeoutsMap = autoSaveTimeoutsRef.current;
    const currentTimeout = timeoutsMap.get(post.id);

    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }

    const timeout = setTimeout(() => {
      const currentDesc = currentDescriptionsRef.current.get(post.id);
      const lastSavedDesc = lastSavedDescriptionsRef.current.get(post.id);

      const descriptionChanged =
        currentDesc !== undefined && currentDesc !== lastSavedDesc;

      if (descriptionChanged) {
        performAutoSaveForPost(post.id);
      }
    }, 3_000);

    timeoutsMap.set(post.id, timeout);

    return () => {
      const timeoutToClean = timeoutsMap.get(post.id);
      if (timeoutToClean) {
        clearTimeout(timeoutToClean);
        timeoutsMap.delete(post.id);
      }
    };
  }, [
    post.id,
    autoSaveTimeoutsRef,
    currentDescriptionsRef,
    lastSavedDescriptionsRef,
    performAutoSaveForPost,
    isEditable,
  ]);

  const handleDelete = async () => {
    try {
      const service = await getPostsService();
      await service.delete(post.id);
      if (onDeleteChild) {
        onDeleteChild(post.id);
      }

      notificationsService.success('Tweet deleted');
    } catch (error) {
      logger.error('Failed to delete tweet', error);
      notificationsService.error('Failed to delete tweet');
    }
  };

  const handleSaveDescription = async () => {
    setIsSavingLocal(true);
    try {
      const currentDescFromRef = currentDescriptionsRef.current.get(post.id);
      const descriptionToSave =
        currentDescFromRef ?? descriptionValue ?? localDescription;

      const service = await getPostsService();
      await service.patch(post.id, { description: descriptionToSave });

      onUpdateChild(post.id, { description: descriptionToSave });

      lastSavedDescriptionsRef.current.set(post.id, descriptionToSave);
      currentDescriptionsRef.current.set(post.id, descriptionToSave);

      notificationsService.success('Tweet saved');
    } catch (error) {
      logger.error('Failed to save tweet', error);
      notificationsService.error('Failed to save tweet');
    } finally {
      setIsSavingLocal(false);
    }
  };

  const isGrokTweet = post.description?.trim().startsWith('@grok') ?? false;
  const isTwitter = platform === CredentialPlatform.TWITTER;
  const placeholder = isParent ? "What's happening?" : `Tweet ${index + 1}...`;
  const hasAnalytics =
    post.status === PostStatus.PUBLIC && post.totalViews !== undefined;

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
                    currentDescFromRef ?? descriptionValue ?? localDescription;
                  return currentDesc !== post.description;
                })()
          }
          isSaving={isParent ? isSaving : isSavingLocal}
          showAddPost={isLast && canAddThread && !isGrokTweet}
          onAddPost={onAddToThread}
          showDelete={!isParent}
          onDelete={
            !isParent
              ? () => {
                  openConfirm({
                    cancelLabel: 'Cancel',
                    confirmLabel: 'Delete',
                    isError: true,
                    label: 'Delete Tweet',
                    message: 'Are you sure you want to delete this tweet?',
                    onConfirm: handleDelete,
                  });
                }
              : undefined
          }
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
