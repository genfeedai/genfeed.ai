'use client';

import type { IIngredient } from '@cloud/interfaces';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { PostDetailCardProps } from '@props/components/post-detail-card.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import PostEnhancementBar from '@ui/posts/enhancement-bar/post-enhancement-bar/PostEnhancementBar';
import { PageScope } from '@ui-constants/misc.constant';
import { createMarkup } from '@utils/sanitize-html';
import { useEffect, useState } from 'react';
import { HiChatBubbleLeftRight, HiEye, HiHeart } from 'react-icons/hi2';

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
      <Card className="overflow-hidden space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 flex items-center justify-center text-sm font-medium transition-colors duration-200 ${
                focusedPostId === post.id
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-foreground'
              }`}
            >
              {index + 1}
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              {publishedDisplay && (
                <span className="text-xs text-success">
                  Published {publishedDisplay}
                </span>
              )}
            </div>

            <div className="space-y-3">
              {/* Title field for non-Twitter platforms (only in edit mode) */}
              {isEditable && isParent && !isTwitter && onLabelChange && (
                <FormControl label="Title">
                  <FormInput
                    name="postTitle"
                    value={labelValue || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      onLabelChange(value);
                      if (post?.id) {
                        currentLabelsRef.current.set(post.id, value);
                      }
                    }}
                    placeholder="Enter post title"
                  />
                </FormControl>
              )}

              {/* Read-only title display for non-publisher scopes */}
              {!isEditable && isParent && !isTwitter && post.label && (
                <h3 className="font-semibold text-lg">{post.label}</h3>
              )}

              {/* Editor for publisher scope */}
              {isEditable && (
                <LazyRichTextEditor
                  placeholder={placeholder}
                  toolbarMode="hidden"
                  value={descriptionValue}
                  minHeight={{ desktop: 150, mobile: 100 }}
                  onChange={(value) => {
                    onDescriptionChange(value);
                    if (post?.id) {
                      currentDescriptionsRef.current.set(post.id, value);
                    }
                  }}
                />
              )}

              {/* Read-only content display for non-publisher scopes */}
              {!isEditable && post.description && (
                <div
                  className="prose prose-sm max-w-none text-foreground"
                  dangerouslySetInnerHTML={createMarkup(post.description)}
                />
              )}

              {/* Carousel validation errors (edit mode only) */}
              {isEditable &&
                !isParent &&
                carouselValidation &&
                !carouselValidation.valid &&
                localIngredients.length > 0 && (
                  <div className=" bg-error/10 p-2">
                    <p className="text-xs text-error font-medium">
                      {carouselValidation.errors.join('. ')}
                    </p>
                  </div>
                )}

              {/* Per-tweet KPIs - shown for all scopes when analytics exist */}
              {hasAnalytics && (
                <div className="flex flex-wrap items-center gap-4 border-t border-white/[0.08] pt-3">
                  <div className="flex items-center gap-1.5 text-xs text-foreground/60">
                    <HiEye className="w-3.5 h-3.5" />
                    <span>{formatCompactNumber(post.totalViews ?? 0)}</span>
                  </div>
                  {post.totalLikes !== undefined && (
                    <div className="flex items-center gap-1.5 text-xs text-foreground/60">
                      <HiHeart className="w-3.5 h-3.5 text-rose-500" />
                      <span>{formatCompactNumber(post.totalLikes)}</span>
                    </div>
                  )}
                  {post.totalComments !== undefined && (
                    <div className="flex items-center gap-1.5 text-xs text-foreground/60">
                      <HiChatBubbleLeftRight className="w-3.5 h-3.5 text-secondary" />
                      <span>{formatCompactNumber(post.totalComments)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Fallback analytics display (edit mode only). */}
              {isEditable &&
                showAnalytics &&
                post.status === PostStatus.PUBLIC &&
                post.totalViews !== undefined &&
                !hasAnalytics && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-3">
                    <div className="text-xs text-foreground/60">
                      {post.totalViews?.toLocaleString() || 0} views
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      </Card>

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
