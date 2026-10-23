import {
  formatPlatformLabel,
  PostRepurposeMode,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { createPublishingApprovalsRoute } from '@genfeedai/contracts/constants';
import {
  RELEASE_RESCHEDULE_ACTION,
  targetRescheduleAction,
  targetRetryAction,
} from '@pages/posts/release/release-detail-drawer';
import {
  createReleaseMutationRunner,
  mutationErrorMessage,
} from '@pages/posts/release/release-mutation-runner';
import {
  CALENDAR_MOVE_ACTION,
  CALENDAR_REPUBLISH_ACTION,
} from '@pages/posts/shared/calendar-republish-dialog';
import {
  isReleaseDragConfirmRequired,
  releaseTargets,
} from '@pages/posts/shared/release-status.helpers';
import type { CalendarEventDrop } from '@props/components/calendar.props';
import type { PendingCalendarDrop } from '@props/publisher/release-calendar.props';
import type { CalendarReleaseActionsOptions } from '@props/publishing/content-calendar-controller.props';
import type { ContentCalendarItem } from '@props/publishing/content-calendar-page.props';
import { logger } from '@services/core/logger.service';
import { useCallback, useMemo, useRef, useState } from 'react';

export function useCalendarReleaseActions({
  releases,
  setReleases,
  getReleaseGroupsService,
  getPostsService,
  notificationsService,
  openPostRepurposeModal,
  push,
  href,
}: CalendarReleaseActionsOptions) {
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingCalendarDrop | null>(
    null,
  );
  const pendingDropRef = useRef<PendingCalendarDrop | null>(null);
  pendingDropRef.current = pendingDrop;
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const selectedRelease = useMemo(
    () => releases.find((release) => release.id === selectedReleaseId) ?? null,
    [releases, selectedReleaseId],
  );

  /**
   * Every schedule mutation shares one path: apply the server's response, or
   * undo whatever the UI already showed and surface the failure. `revert` is the
   * calendar's own undo for a drag; state mutations restore the prior list.
   * The apply-or-revert path itself is shared with the rail list's drawer via
   * `createReleaseMutationRunner` — only `onSuccess` differs here.
   */
  const runMutation = useMemo(
    () =>
      createReleaseMutationRunner({
        getReleaseGroupsService,
        notificationsService,
        onSuccess: (updated) => {
          setReleases((current) => {
            const exists = current.some((release) => release.id === updated.id);
            if (exists) {
              return current.map((release) =>
                release.id === updated.id ? updated : release,
              );
            }
            return [...current, updated];
          });
        },
        setDrawerError,
        setPendingAction,
      }),
    [getReleaseGroupsService, notificationsService, setReleases],
  );

  const handleEventDrop = useCallback(
    (change: CalendarEventDrop<ContentCalendarItem>) => {
      if (change.item.itemType !== 'release') {
        change.revert();
        return;
      }

      if (pendingDropRef.current) {
        change.revert();
        return;
      }

      if (!Number.isFinite(change.start.getTime())) {
        change.revert();
        notificationsService.error('That drop time is not a valid schedule.');
        return;
      }

      const { release } = change.item;
      const scheduledDate = change.start.toISOString();

      if (isReleaseDragConfirmRequired(release)) {
        setPendingDrop({
          release,
          revert: change.revert,
          scheduledDate,
        });
        return;
      }

      const previous = releases;

      // Optimistic: the event is already in its new slot, so the list has to
      // agree before the request resolves or the drawer contradicts the grid.
      setReleases((current) =>
        current.map((entry) =>
          entry.id === release.id
            ? { ...entry, scheduledAt: scheduledDate }
            : entry,
        ),
      );

      void runMutation(
        RELEASE_RESCHEDULE_ACTION,
        (service) => service.update(release.id, { scheduledDate }),
        () => {
          change.revert();
          setReleases(previous);
        },
      );
    },
    [
      notificationsService,
      releases,
      runMutation, // Optimistic: the event is already in its new slot, so the list has to
      // agree before the request resolves or the drawer contradicts the grid.
      setReleases,
    ],
  );

  const clearPendingDrop = useCallback((shouldRevert: boolean) => {
    setPendingDrop((current) => {
      if (shouldRevert) {
        current?.revert();
      }
      return null;
    });
  }, []);

  const handleCancelPendingDrop = useCallback(() => {
    clearPendingDrop(true);
  }, [clearPendingDrop]);

  const handleCardOnlyDrop = useCallback(() => {
    if (!pendingDrop) {
      return;
    }

    const { release, revert, scheduledDate } = pendingDrop;
    const previous = releases;

    void (async () => {
      await runMutation(
        CALENDAR_MOVE_ACTION,
        (service) => service.moveCalendarPlacement(release.id, scheduledDate),
        () => {
          revert();
          setReleases(previous);
        },
      );
      setPendingDrop(null);
    })();
  }, [pendingDrop, releases, runMutation, setReleases]);

  const handleRepublishDrop = useCallback(() => {
    if (!pendingDrop) {
      return;
    }

    const { release, revert, scheduledDate } = pendingDrop;
    const previous = releases;

    void (async () => {
      await runMutation(
        CALENDAR_REPUBLISH_ACTION,
        (service) => service.republishAt(release.id, scheduledDate),
        () => {
          revert();
          setReleases(previous);
        },
      );
      setPendingDrop(null);
    })();
  }, [pendingDrop, releases, runMutation, setReleases]);

  const handleRescheduleRelease = useCallback(
    (scheduledDate: string) => {
      if (!selectedReleaseId) {
        return;
      }

      void runMutation(RELEASE_RESCHEDULE_ACTION, (service) =>
        service.update(selectedReleaseId, { scheduledDate }),
      );
    },
    [runMutation, selectedReleaseId],
  );

  const handleRescheduleTarget = useCallback(
    (targetId: string, scheduledDate: string) => {
      if (!selectedReleaseId) {
        return;
      }

      void runMutation(targetRescheduleAction(targetId), (service) =>
        service.updateTarget(selectedReleaseId, targetId, { scheduledDate }),
      );
    },
    [runMutation, selectedReleaseId],
  );

  /**
   * A manual retry is expressed as moving a failed target back to `scheduled`.
   * The API turns that transition into a fresh publish attempt — there is no
   * separate retry endpoint to call.
   */
  /**
   * "Add channel → adapt content" (#2588): repurpose the release's first
   * channel target into a draft target for another platform. Deterministic
   * mode keeps the drawer open on the refreshed release; agent mode navigates
   * to the review queue where the rewritten draft lands.
   */
  const handleAddChannel = useCallback(() => {
    const sourceTarget = releaseTargets(selectedRelease)[0];
    if (!selectedRelease || !sourceTarget) {
      return;
    }

    openPostRepurposeModal(
      {
        id: sourceTarget.id,
        label: selectedRelease.title,
        platform: sourceTarget.platform,
      },
      async (platform, mode) => {
        try {
          const postsService = await getPostsService();
          const draft = await postsService.repurpose(sourceTarget.id, {
            mode,
            platform,
          });

          if (mode === PostRepurposeMode.AGENT) {
            notificationsService.success(
              'Rewritten draft sent to the review queue',
            );
            push(
              href(
                createPublishingApprovalsRoute({
                  run: draft.reviewTurboRunId,
                  filter: draft.reviewTurboRunId ? 'ready' : undefined,
                }),
              ),
            );
            return;
          }

          notificationsService.success(
            `Draft target added for ${formatPlatformLabel(platform) ?? platform}`,
          );
          const releaseGroupsService = await getReleaseGroupsService();
          const updated = await releaseGroupsService.getOne(selectedRelease.id);
          setReleases((current) =>
            current.map((release) =>
              release.id === updated.id ? updated : release,
            ),
          );
        } catch (error) {
          const message = mutationErrorMessage(error);
          logger.error('Failed to repurpose release target', error);
          notificationsService.error(message);
          throw error;
        }
      },
    );
  }, [
    selectedRelease,
    openPostRepurposeModal,
    getPostsService,
    getReleaseGroupsService,
    notificationsService,
    push,
    href,
    setReleases,
  ]);

  const handleRetryTarget = useCallback(
    (targetId: string) => {
      if (!selectedReleaseId) {
        return;
      }

      void runMutation(targetRetryAction(targetId), (service) =>
        service.updateTarget(selectedReleaseId, targetId, {
          executionState: TargetExecutionState.SCHEDULED,
        }),
      );
    },
    [runMutation, selectedReleaseId],
  );

  const handleResumeRelease = useCallback(() => {
    if (!selectedReleaseId) {
      return;
    }
    void runMutation('release:resume', (service) =>
      service.resume(selectedReleaseId),
    );
  }, [runMutation, selectedReleaseId]);

  return {
    selectedRelease,
    setSelectedReleaseId,
    pendingAction,
    pendingDrop,
    drawerError,
    setDrawerError,
    handleEventDrop,
    handleCancelPendingDrop,
    handleCardOnlyDrop,
    handleRepublishDrop,
    handleRescheduleRelease,
    handleRescheduleTarget,
    handleRetryTarget,
    handleResumeRelease,
    handleAddChannel,
  };
}
