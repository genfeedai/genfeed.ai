'use client';

import type { IPost } from '@cloud/interfaces';
import { PostStatus } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useConfirmDeleteModal } from '@providers/global-modals/global-modals.provider';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import type { NotificationsService } from '@services/core/notifications.service';
import type { PostQuickActionKey } from '@ui/posts/quick-actions/post-quick-actions/PostQuickActions';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useCallback } from 'react';

export interface UsePostDetailActionsOptions {
  post: IPost | null;
  setPost: React.Dispatch<React.SetStateAction<IPost | null>>;
  getPostsService: () => Promise<PostsService>;
  notificationsService: NotificationsService;
  router: AppRouterInstance;
  fetchPost: (isRefresh?: boolean) => Promise<void>;
  updateActivePost: (
    updates: Partial<IPost>,
    successMessage?: string,
    silent?: boolean,
  ) => Promise<IPost | null>;
  handleUpdateChild: (childId: string, updates: Partial<IPost>) => void;
  updateDescriptionRefs: (refPostId: string, description: string) => void;

  // Draft accessors
  descriptionDraft: string;
  setDescriptionDraft: (value: string) => void;
  labelDraft: string;
  scheduleDraft: string;
  isContentDirty: boolean;
  isDescriptionDirty: boolean;
  isLabelDirty: boolean;
  isScheduleDirty: boolean;
  setIsSavingDescription: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSavingSchedule: React.Dispatch<React.SetStateAction<boolean>>;
  setEnhancingPostId: React.Dispatch<React.SetStateAction<string | null>>;
  setEnhancingAction: React.Dispatch<React.SetStateAction<string | null>>;
  setChildDescriptions: (childId: string, value: string) => void;
}

export interface UsePostDetailActionsReturn {
  handleContentSave: () => Promise<void>;
  handleScheduleSave: () => Promise<void>;
  handleDeletePost: () => void;
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
}

export function usePostDetailActions({
  post,
  setPost,
  getPostsService,
  notificationsService,
  router,
  fetchPost,
  updateActivePost,
  handleUpdateChild,
  updateDescriptionRefs,
  descriptionDraft,
  setDescriptionDraft,
  labelDraft,
  scheduleDraft,
  isContentDirty,
  isDescriptionDirty,
  isLabelDirty,
  isScheduleDirty,
  setIsSavingDescription,
  setIsSavingSchedule,
  setEnhancingPostId,
  setEnhancingAction,
  setChildDescriptions,
}: UsePostDetailActionsOptions): UsePostDetailActionsReturn {
  const { openConfirmDelete } = useConfirmDeleteModal();
  const { href } = useOrgUrl();

  // Content save handler
  const handleContentSave = useCallback(async () => {
    if (!isContentDirty) {
      return;
    }

    setIsSavingDescription(true);
    try {
      const updates: { description?: string; label?: string } = {};

      if (isDescriptionDirty) {
        updates.description = descriptionDraft;
      }
      if (isLabelDirty) {
        updates.label = labelDraft.trim();
      }

      await updateActivePost(updates, 'Post updated');
    } finally {
      setIsSavingDescription(false);
    }
  }, [
    isContentDirty,
    isDescriptionDirty,
    isLabelDirty,
    descriptionDraft,
    labelDraft,
    updateActivePost,
    setIsSavingDescription,
  ]);

  // Schedule save handler
  const handleScheduleSave = useCallback(async () => {
    if (!post || !isScheduleDirty) {
      return;
    }

    setIsSavingSchedule(true);

    try {
      const updates: { scheduledDate: string; status?: PostStatus } = {
        scheduledDate: scheduleDraft,
      };

      if (scheduleDraft) {
        updates.status = PostStatus.SCHEDULED;
      } else {
        updates.status = PostStatus.DRAFT;
      }

      await updateActivePost(updates, 'Schedule updated', true);
      await fetchPost(true);

      if (scheduleDraft) {
        notificationsService.success('Schedule date updated');
      } else {
        notificationsService.success('Schedule date cleared');
      }
    } catch (err) {
      logger.error('Failed to update schedule', err);
      notificationsService.error('Failed to update schedule');
    } finally {
      setIsSavingSchedule(false);
    }
  }, [
    post,
    isScheduleDirty,
    scheduleDraft,
    updateActivePost,
    fetchPost,
    notificationsService,
    setIsSavingSchedule,
  ]);

  // Delete post handler
  const handleDeletePost = useCallback(() => {
    if (!post) {
      return;
    }

    openConfirmDelete({
      entity: {
        id: post.id,
        label: post.label || post.description || 'this post',
      },
      entityName: 'post',
      onConfirm: async () => {
        try {
          const service = await getPostsService();
          await service.delete(post.id);
          notificationsService.success('Post deleted successfully');
          router.push(href('/posts'));
        } catch (err) {
          logger.error('Failed to delete post', err);
          notificationsService.error('Failed to delete post');
        }
      },
    });
  }, [post, openConfirmDelete, getPostsService, notificationsService, router]);

  // Quick action handler
  const handleQuickAction = useCallback(
    async (
      actionPostId: string,
      prompt: string,
      actionKey: PostQuickActionKey,
      tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
    ) => {
      if (!post) {
        return;
      }

      setEnhancingPostId(actionPostId);
      setEnhancingAction(actionKey);

      try {
        const service = await getPostsService();
        const enhanced = await service.enhance(actionPostId, prompt, tone);

        if (actionPostId === post.id) {
          const newDescription = enhanced.description || '';
          setDescriptionDraft(newDescription);
          if (post.id) {
            updateDescriptionRefs(post.id, newDescription);
          }
          setPost((prevPost) => ({
            ...enhanced,
            children: enhanced.children ?? prevPost?.children ?? [],
            credential: enhanced.credential ?? prevPost?.credential,
          }));
        } else {
          handleUpdateChild(actionPostId, {
            description: enhanced.description,
          });
          const newDescription = enhanced.description || '';
          setChildDescriptions(actionPostId, newDescription);
          if (actionPostId) {
            updateDescriptionRefs(actionPostId, newDescription);
          }
        }

        notificationsService.success('Tweet enhanced');
      } catch (err) {
        logger.error('Quick action failed', err);
        notificationsService.error('Failed to enhance tweet');
      } finally {
        setEnhancingPostId(null);
        setEnhancingAction(null);
      }
    },
    [
      post,
      getPostsService,
      notificationsService,
      handleUpdateChild,
      updateDescriptionRefs,
      setDescriptionDraft,
      setPost,
      setEnhancingPostId,
      setEnhancingAction,
      setChildDescriptions,
    ],
  );

  // Per-tweet enhance handler
  const handlePerTweetEnhance = useCallback(
    async (
      enhancePostId: string,
      prompt: string,
      tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
    ) => {
      if (!post) {
        return;
      }

      setEnhancingPostId(enhancePostId);

      try {
        const service = await getPostsService();
        const enhanced = await service.enhance(enhancePostId, prompt, tone);

        if (enhancePostId === post.id) {
          const newDescription = enhanced.description || '';
          setDescriptionDraft(newDescription);
          if (post.id) {
            updateDescriptionRefs(post.id, newDescription);
          }
          setPost((prevPost) => ({
            ...enhanced,
            children: enhanced.children ?? prevPost?.children ?? [],
            credential: enhanced.credential ?? prevPost?.credential,
          }));
        } else {
          handleUpdateChild(enhancePostId, {
            description: enhanced.description,
          });
          const newDescription = enhanced.description || '';
          setChildDescriptions(enhancePostId, newDescription);
          if (enhancePostId) {
            updateDescriptionRefs(enhancePostId, newDescription);
          }
        }

        notificationsService.success('Tweet enhanced');
      } catch (err) {
        logger.error('Enhancement failed', err);
        notificationsService.error('Failed to enhance tweet');
      } finally {
        setEnhancingPostId(null);
      }
    },
    [
      post,
      getPostsService,
      notificationsService,
      handleUpdateChild,
      updateDescriptionRefs,
      setDescriptionDraft,
      setPost,
      setEnhancingPostId,
      setChildDescriptions,
    ],
  );

  return {
    handleContentSave,
    handleDeletePost,
    handlePerTweetEnhance,
    handleQuickAction,
    handleScheduleSave,
  };
}
