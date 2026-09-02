'use client';

import { useConfirmDeleteModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { TargetExecutionState } from '@genfeedai/contracts';
import type {
  IPost,
  PostQuickActionKey,
} from '@genfeedai/contracts/interfaces';
import type {
  PostsService,
  PostUpdateInput,
} from '@genfeedai/services/content/posts.service';
import type { ReleaseGroupsService } from '@genfeedai/services/content/release-groups.service';
import { logger } from '@genfeedai/services/core/logger.service';
import type { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useCallback } from 'react';

export interface UsePostDetailActionsOptions {
  post: IPost | null;
  setPost: React.Dispatch<React.SetStateAction<IPost | null>>;
  getPostsService: () => Promise<PostsService>;
  getReleaseGroupsService: () => Promise<ReleaseGroupsService>;
  notificationsService: NotificationsService;
  router: AppRouterInstance;
  fetchPost: (isRefresh?: boolean) => Promise<void>;
  updateActivePost: (
    updates: PostUpdateInput,
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
  handlePublishNow: () => Promise<void>;
  handlePublishViaTikTokApp: () => Promise<void>;
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

function requirePostId(post: IPost): string {
  if (typeof post.id !== 'string' || post.id.length === 0) {
    throw new Error('Post is missing an id');
  }
  return post.id;
}

export function usePostDetailActions({
  post,
  setPost,
  getPostsService,
  getReleaseGroupsService,
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

  const resolveReleaseGroupId = useCallback(async (): Promise<string> => {
    if (!post) {
      throw new Error('Post is required');
    }
    if (post.groupId) {
      return post.groupId;
    }
    const releases = await getReleaseGroupsService();
    const release = await releases.ensureFromPost(requirePostId(post));
    return release.id;
  }, [getReleaseGroupsService, post]);

  const commitSchedule = useCallback(
    async (scheduledAt: string, successMessage: string) => {
      if (!post) {
        return;
      }

      setIsSavingSchedule(true);
      try {
        const releases = await getReleaseGroupsService();
        const groupId = await resolveReleaseGroupId();
        await releases.scheduleTarget(
          groupId,
          requirePostId(post),
          scheduledAt,
        );
        await fetchPost(true);
        notificationsService.success(successMessage);
      } catch (err) {
        logger.error('Failed to update schedule', err);
        notificationsService.error('Failed to update schedule');
      } finally {
        setIsSavingSchedule(false);
      }
    },
    [
      fetchPost,
      getReleaseGroupsService,
      notificationsService,
      post,
      resolveReleaseGroupId,
      setIsSavingSchedule,
    ],
  );

  const handleScheduleSave = useCallback(async () => {
    if (!post || !isScheduleDirty) {
      return;
    }

    if (!scheduleDraft) {
      setIsSavingSchedule(true);
      try {
        await updateActivePost(
          {
            scheduledDate: '',
            targetExecutionState: TargetExecutionState.DRAFT,
          },
          'Schedule updated',
          true,
        );
        await fetchPost(true);
        notificationsService.success('Schedule date cleared');
      } catch (err) {
        logger.error('Failed to update schedule', err);
        notificationsService.error('Failed to update schedule');
      } finally {
        setIsSavingSchedule(false);
      }
      return;
    }

    await commitSchedule(scheduleDraft, 'Schedule date updated');
  }, [
    commitSchedule,
    fetchPost,
    isScheduleDirty,
    notificationsService,
    post,
    scheduleDraft,
    setIsSavingSchedule,
    updateActivePost,
  ]);

  const handlePublishNow = useCallback(async () => {
    if (!post) {
      return;
    }

    setIsSavingSchedule(true);
    try {
      // No client timestamp: the server stamps its own clock so skew or
      // latency can't reject the request or silently schedule it instead.
      const releases = await getReleaseGroupsService();
      const groupId = await resolveReleaseGroupId();
      await releases.publishTargetNow(groupId, requirePostId(post));
      await fetchPost(true);
      notificationsService.success('Publishing now');
    } catch (err) {
      logger.error('Failed to publish now', err);
      notificationsService.error('Failed to publish now');
    } finally {
      setIsSavingSchedule(false);
    }
  }, [
    fetchPost,
    getReleaseGroupsService,
    notificationsService,
    post,
    resolveReleaseGroupId,
    setIsSavingSchedule,
  ]);

  const handlePublishViaTikTokApp = useCallback(async () => {
    if (!post) {
      return;
    }

    setIsSavingSchedule(true);
    try {
      const releases = await getReleaseGroupsService();
      const groupId = await resolveReleaseGroupId();
      await releases.publishTargetViaTikTokApp(groupId, requirePostId(post));
      await fetchPost(true);
      notificationsService.success(
        'Sent to TikTok. Open your TikTok Inbox to add music or final edits, then publish.',
      );
    } catch (err) {
      logger.error('Failed to send video to TikTok app', err);
      notificationsService.error('Failed to send video to TikTok app');
    } finally {
      setIsSavingSchedule(false);
    }
  }, [
    fetchPost,
    getReleaseGroupsService,
    notificationsService,
    post,
    resolveReleaseGroupId,
    setIsSavingSchedule,
  ]);

  // Delete post handler
  const handleDeletePost = useCallback(() => {
    if (!post) {
      return;
    }

    openConfirmDelete({
      entity: {
        id: requirePostId(post),
        label: post.label || post.description || 'this post',
      },
      entityName: 'post',
      onConfirm: async () => {
        try {
          const service = await getPostsService();
          await service.delete(requirePostId(post));
          notificationsService.success('Post deleted successfully');
          router.push(href('/publishing'));
        } catch (err) {
          logger.error('Failed to delete post', err);
          notificationsService.error('Failed to delete post');
        }
      },
    });
  }, [
    post,
    openConfirmDelete,
    getPostsService,
    notificationsService,
    router,
    href,
  ]);

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
    handlePublishNow,
    handlePublishViaTikTokApp,
    handleQuickAction,
    handleScheduleSave,
  };
}
