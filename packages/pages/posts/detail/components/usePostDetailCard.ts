'use client';

import { CredentialPlatform, PageScope, PostStatus } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import type { PostDetailCardProps } from '@props/components/post-detail-card.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { useEffect, useState } from 'react';

type UsePostDetailCardParams = Pick<
  PostDetailCardProps,
  | 'post'
  | 'index'
  | 'scope'
  | 'platform'
  | 'descriptionValue'
  | 'getPostsService'
  | 'onUpdateChild'
  | 'notificationsService'
  | 'onDeleteChild'
  | 'currentDescriptionsRef'
  | 'currentLabelsRef'
  | 'lastSavedDescriptionsRef'
  | 'autoSaveTimeoutsRef'
  | 'performAutoSaveForPost'
>;

export function usePostDetailCard({
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
}: UsePostDetailCardParams) {
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

  const openDeleteConfirm = () => {
    openConfirm({
      cancelLabel: 'Cancel',
      confirmLabel: 'Delete',
      isError: true,
      label: 'Delete Tweet',
      message: 'Are you sure you want to delete this tweet?',
      onConfirm: handleDelete,
    });
  };

  return {
    isEditable,
    isParent,
    localDescription,
    localIngredients,
    isSavingLocal,
    isGrokTweet,
    isTwitter,
    placeholder,
    hasAnalytics,
    handleSaveDescription,
    openDeleteConfirm,
  };
}
