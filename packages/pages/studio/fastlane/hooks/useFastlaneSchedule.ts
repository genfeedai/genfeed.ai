'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useCallback, useState } from 'react';
import type {
  ScheduleApprovedParams,
  UseFastlaneScheduleReturn,
} from '../types';
import { buildFastlaneReleaseInput } from '../utils/fastlane-release';

export function useFastlaneSchedule(
  brandId: string,
): UseFastlaneScheduleReturn {
  const [isScheduling, setIsScheduling] = useState(false);

  const getReleaseGroupsService = useAuthedService((token: string) =>
    ReleaseGroupsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();

  const scheduleApproved = useCallback(
    async ({
      assets,
      targets,
      captions,
      postingSetId,
      timezone,
    }: ScheduleApprovedParams): Promise<void> => {
      const approved = assets.filter(
        (asset) => asset.status === 'approved' && asset.ingredientId,
      );

      if (approved.length === 0 || targets.length === 0) {
        return;
      }

      setIsScheduling(true);

      try {
        const service = await getReleaseGroupsService();

        const results = await Promise.allSettled(
          approved.map(async (asset) => {
            const input = buildFastlaneReleaseInput({
              asset,
              brandId,
              caption: captions[asset.idea.id] ?? asset.idea.caption,
              postingSetId,
              targets,
              timezone,
            });
            if (!input) {
              throw new Error(
                'Fastlane release is missing media or a valid platform target.',
              );
            }

            const release = await service.create(input);
            const channelTargets = release.targets ?? [];
            if (channelTargets.length === 0) {
              throw new Error(
                'Fastlane release created with no channel targets.',
              );
            }

            await Promise.all(
              channelTargets.map((channelTarget) => {
                const requested = targets.find(
                  (target) =>
                    target.credentialId === channelTarget.credentialId,
                );
                if (requested?.scheduledDate) {
                  return service.scheduleTarget(
                    release.id,
                    channelTarget.id,
                    requested.scheduledDate,
                  );
                }
                return service.publishTargetNow(release.id, channelTarget.id);
              }),
            );
          }),
        );

        const failedCount = results.filter(
          (result) => result.status === 'rejected',
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
    [brandId, getReleaseGroupsService, notificationsService],
  );

  return { isScheduling, scheduleApproved };
}
