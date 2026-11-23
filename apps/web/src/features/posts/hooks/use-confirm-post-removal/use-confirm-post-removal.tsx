'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { PostStatus } from '@genfeedai/contracts';
import { supportsPostDeletionOnPlatform } from '@genfeedai/contracts/constants';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { stripHtmlToPlainText } from '@helpers/security/strip-html.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import PostRemovalOptions from '@/features/posts/components/PostRemovalOptions';

/**
 * The one delete flow for posts, published ones included. It asks first, says
 * that a published post stays on its social network, lets the person delete
 * the Library media the posts use, deletes through `POST /posts/:id/deletions`
 * (the path the MCP and CLI delete use), and reports what the read-back found.
 */
export function useConfirmPostRemoval() {
  const translate = useTranslations('ui.postRemoval');
  const { openConfirm } = useConfirmModal();
  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  return useCallback(
    (
      posts: IPost[],
      onRemoved: (removedIds: string[]) => void | Promise<void>,
    ) => {
      if (posts.length === 0) {
        return;
      }

      const includeMediaRef = { current: false };
      const deleteOnPlatformRef = { current: false };
      // Deleting on the network applies to a published post on a platform
      // Genfeed can delete on; every other post is deleted in Genfeed only.
      const canDeleteOnPlatform = (post: IPost) =>
        post.status === PostStatus.PUBLIC &&
        supportsPostDeletionOnPlatform(post.platform);
      const isOne = posts.length === 1;
      const label =
        posts[0].label?.trim() ||
        stripHtmlToPlainText(posts[0].description) ||
        'this post';

      openConfirm({
        children: (
          <PostRemovalOptions
            deleteOnPlatformRef={deleteOnPlatformRef}
            hasPlatformDeletable={posts.some(canDeleteOnPlatform)}
            hasMedia={posts.some((post) => (post.ingredients?.length ?? 0) > 0)}
            hasPublished={posts.some(
              (post) => post.status === PostStatus.PUBLIC,
            )}
            includeMediaRef={includeMediaRef}
          />
        ),
        confirmLabel: translate('confirm'),
        isError: true,
        label: isOne
          ? translate('titleOne')
          : translate('titleMany', { count: posts.length }),
        message: isOne
          ? translate('messageOne', { label })
          : translate('messageMany', { count: posts.length }),
        onConfirm: async () => {
          const removedIds: string[] = [];
          let platformDeleted = 0;
          let mediaDeleted = 0;
          let mediaKept = 0;
          let failed = 0;
          let notGone = 0;

          try {
            const service = await getPostsService();
            for (const post of posts) {
              try {
                const result = await service.remove(post.id, {
                  deleteOnPlatform:
                    deleteOnPlatformRef.current && canDeleteOnPlatform(post),
                  includeMedia: includeMediaRef.current,
                });
                if (result.deletedOnPlatform) {
                  platformDeleted += 1;
                }
                if (result.verified.postGone) {
                  removedIds.push(post.id);
                } else {
                  notGone += 1;
                }
                mediaDeleted += result.media.deleted.length;
                mediaKept += result.media.kept.length;
              } catch (error) {
                failed += 1;
                logger.error('Failed to delete post', error);
              }
            }
          } catch (error) {
            failed = posts.length;
            logger.error('Failed to delete post', error);
          }

          if (removedIds.length > 0) {
            const summary = [
              platformDeleted > 0
                ? ` ${translate('platformSummary', { count: platformDeleted })}`
                : '',
              mediaDeleted + mediaKept > 0
                ? ` ${translate('mediaSummary', { deleted: mediaDeleted, kept: mediaKept })}`
                : '',
            ].join('');
            notificationsService.success(
              `${
                removedIds.length === 1
                  ? translate('deletedOne')
                  : translate('deletedMany', { count: removedIds.length })
              }.${summary}`,
            );
            await onRemoved(removedIds);
          }
          if (notGone > 0) {
            notificationsService.error(translate('notGone'));
          }
          if (failed > 0) {
            notificationsService.error(
              failed === 1
                ? translate('failedOne')
                : translate('failedMany', { count: failed }),
            );
          }
        },
      });
    },
    [getPostsService, notificationsService, openConfirm, translate],
  );
}
