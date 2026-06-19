'use client';

import { PostCategory, PostStatus } from '@genfeedai/enums';
import type { FastlaneScheduleTarget } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Post } from '@models/content/post.model';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useCallback, useState } from 'react';
import type {
  ScheduleApprovedParams,
  UseFastlaneScheduleReturn,
} from '../types';

export function useFastlaneSchedule(): UseFastlaneScheduleReturn {
  const [isScheduling, setIsScheduling] = useState(false);

  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();

  const scheduleApproved = useCallback(
    async ({
      assets,
      targets,
      captions,
      timezone,
    }: ScheduleApprovedParams): Promise<void> => {
      const approved = assets.filter(
        (a) => a.status === 'approved' && a.ingredientId,
      );

      if (approved.length === 0 || targets.length === 0) {
        return;
      }

      setIsScheduling(true);

      // Single shared groupId for this Fastlane batch
      const groupId = crypto.randomUUID();

      try {
        const service = await getPostsService();

        const posts = approved.flatMap((asset) =>
          targets.map((target: FastlaneScheduleTarget) => {
            const editedCaption = captions[asset.idea.id] ?? asset.idea.caption;
            const category =
              asset.idea.format === 'image'
                ? PostCategory.IMAGE
                : PostCategory.VIDEO;

            const status = target.scheduledDate
              ? PostStatus.SCHEDULED
              : PostStatus.PENDING;

            // PostsService extends BaseService<Post> with TCreate = Partial<Post>.
            // We cast via unknown to include the 'source' field that is part of
            // CreatePostDto but not reflected on the IPost read model.
            const payload = {
              credential: target.credentialId,
              ingredients: [asset.ingredientId as string],
              label: asset.idea.hook.slice(0, 100),
              description: editedCaption,
              category,
              status,
              scheduledDate: target.scheduledDate ?? undefined,
              timezone,
              groupId,
              source: 'fastlane',
              isShareToFeedSelected: true,
            } as unknown as Partial<Post>;

            return { asset, target, payload };
          }),
        );

        const results = await Promise.allSettled(
          posts.map(({ payload }) => service.post(payload)),
        );

        const failedCount = results.filter(
          (r) => r.status === 'rejected',
        ).length;

        if (failedCount > 0) {
          const successCount = results.length - failedCount;
          logger.warn('Fastlane: partial schedule failure', {
            failedCount,
            successCount,
          });
          notificationsService.error(
            `${successCount} post${successCount !== 1 ? 's' : ''} scheduled, ${failedCount} failed. Check your connected accounts.`,
          );
        } else {
          notificationsService.success?.(
            `${results.length} post${results.length !== 1 ? 's' : ''} scheduled successfully`,
          );
        }
      } catch (err) {
        logger.error('Fastlane: scheduleApproved failed', err);
        notificationsService.error(
          'Failed to schedule posts. Please try again.',
        );
      } finally {
        setIsScheduling(false);
      }
    },
    [getPostsService, notificationsService],
  );

  return { isScheduling, scheduleApproved };
}
