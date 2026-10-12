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
import { stripHtmlToPlainText } from '@helpers/security/sanitize-html.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useCallback } from 'react';

export interface UsePostDetailActionsOptions {
  post: IPost | null;
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

  // Draft accessors
  descriptionDraft: string;
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
  ) => Promise<string | null>;
  handlePerTweetEnhance: (
    postId: string,
    prompt: string,
    tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
  ) => Promise<string | null>;
  handleDraftThread: (
    postId: string,
    tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
  ) => Promise<string[] | null>;
}

function requirePostId(post: IPost): string {
  if (typeof post.id !== 'string' || post.id.length === 0) {
    throw new Error('Post is missing an id');
  }
  return post.id;
}

export function usePostDetailActions({
  post,
  getPostsService,
  getReleaseGroupsService,
  notificationsService,
  router,
  fetchPost,
  updateActivePost,
  descriptionDraft,
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
        label:
          post.label || stripHtmlToPlainText(post.description) || 'this post',
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

  // AI rewrites return a proposal; the caller decides whether to apply it.
  const requestRewriteDraft = useCallback(
    async (
      actionPostId: string,
      prompt: string,
      tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
      actionKey: PostQuickActionKey | null = null,
    ): Promise<string | null> => {
      if (!post) {
        return null;
      }

      setEnhancingPostId(actionPostId);
      setEnhancingAction(actionKey);

      try {
        const service = await getPostsService();
        const draft = await service.enhance(actionPostId, prompt, tone, {
          isDraft: true,
        });
        return draft.description || null;
      } catch (err) {
        logger.error('AI rewrite failed', err);
        notificationsService.error('Failed to rewrite. Try again.');
        return null;
      } finally {
        setEnhancingPostId(null);
        setEnhancingAction(null);
      }
    },
    [
      post,
      getPostsService,
      notificationsService,
      setEnhancingPostId,
      setEnhancingAction,
    ],
  );

  const handleQuickAction = useCallback(
    (
      actionPostId: string,
      prompt: string,
      actionKey: PostQuickActionKey,
      tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
    ) => requestRewriteDraft(actionPostId, prompt, tone, actionKey),
    [requestRewriteDraft],
  );

  const handlePerTweetEnhance = useCallback(
    (
      enhancePostId: string,
      prompt: string,
      tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
    ) => requestRewriteDraft(enhancePostId, prompt, tone),
    [requestRewriteDraft],
  );

  // Proposed X replies; nothing is saved until the user adds them.
  const handleDraftThread = useCallback(
    async (
      draftPostId: string,
      tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
    ): Promise<string[] | null> => {
      if (!post) {
        return null;
      }

      setEnhancingPostId(draftPostId);
      setEnhancingAction(null);

      try {
        const service = await getPostsService();
        const replies = await service.draftThread(draftPostId, 4, tone);
        return replies.length > 0 ? replies : null;
      } catch (err) {
        logger.error('Thread draft failed', err);
        notificationsService.error('Failed to draft the thread. Try again.');
        return null;
      } finally {
        setEnhancingPostId(null);
      }
    },
    [
      post,
      getPostsService,
      notificationsService,
      setEnhancingPostId,
      setEnhancingAction,
    ],
  );

  return {
    handleContentSave,
    handleDraftThread,
    handleDeletePost,
    handlePerTweetEnhance,
    handlePublishNow,
    handlePublishViaTikTokApp,
    handleQuickAction,
    handleScheduleSave,
  };
}
