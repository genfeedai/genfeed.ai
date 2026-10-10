import {
  TurboRewriteItemFailureReason,
  TurboRewriteJobStatus,
} from '@genfeedai/contracts';
import type {
  IBackgroundTaskUpdateEvent,
  ITurboRewriteJob,
} from '@genfeedai/contracts/interfaces';
import type {
  ReviewRewriteProgressProps,
  UseTurboRewriteJobParams,
} from '@genfeedai/props/publishing/review-rewrite-progress.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { TurboRunsService } from '@services/batch/batches.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REFRESH_DEBOUNCE_MS = 250;

function isTerminal(job: ITurboRewriteJob): boolean {
  return (
    job.status !== TurboRewriteJobStatus.QUEUED &&
    job.status !== TurboRewriteJobStatus.PROCESSING
  );
}

/**
 * Tracks the Review batch rewrite that runs as a background job (#5365). The
 * job id comes back immediately; `background-task-update` socket events for it
 * trigger a status read, rewritten rows refresh as they land, and a reload
 * resumes the batch's active job.
 */
export function useTurboRewriteJob({
  turboRunId,
  onItemsRewritten,
}: UseTurboRewriteJobParams) {
  const translate = useTranslations('common.turboRewrite');
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getTurboRunsService = useAuthedService((token: string) =>
    TurboRunsService.getInstance(token),
  );
  const { connectionState, isReady, subscribe } = useSocketManager();
  const [job, setJob] = useState<ITurboRewriteJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const latestItemsRewritten = useRef(onItemsRewritten);
  const seenCompletedCount = useRef(0);
  const announcedJobIds = useRef(new Set<string>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousConnectionState = useRef(connectionState);

  useEffect(() => {
    latestItemsRewritten.current = onItemsRewritten;
  }, [onItemsRewritten]);

  const announceOutcome = useCallback(
    (finished: ITurboRewriteJob) => {
      const completed = finished.completedItemIds.length;
      const failed = finished.failedItems.length;
      if (finished.status === TurboRewriteJobStatus.CANCELLED) {
        notifications.info(translate('cancelled', { count: completed }));
      } else if (finished.status === TurboRewriteJobStatus.COMPLETED) {
        notifications.success(translate('completed', { count: completed }));
      } else if (
        failed > 0 &&
        finished.failedItems.every(
          (failure) =>
            failure.reason ===
            TurboRewriteItemFailureReason.INSUFFICIENT_CREDITS,
        )
      ) {
        notifications.error(translate('insufficientCredits'));
      } else if (finished.status === TurboRewriteJobStatus.PARTIALLY_FAILED) {
        notifications.warning(translate('partial', { completed, failed }));
      } else {
        notifications.error(translate('failed'));
      }
    },
    [notifications, translate],
  );

  const applyJob = useCallback(
    (next: ITurboRewriteJob) => {
      const hasNewRewrites =
        next.completedItemIds.length > seenCompletedCount.current;
      seenCompletedCount.current = next.completedItemIds.length;
      if (isTerminal(next)) {
        setJob((current) => (current?.id === next.id ? null : current));
        setIsCancelling(false);
        if (!announcedJobIds.current.has(next.id)) {
          announcedJobIds.current.add(next.id);
          announceOutcome(next);
          void latestItemsRewritten.current();
        }
        return;
      }
      setJob((current) => (current?.id === next.id ? next : current));
      if (hasNewRewrites) {
        void latestItemsRewritten.current();
      }
    },
    [announceOutcome],
  );

  const refreshJob = useCallback(
    async (jobTurboRunId: string, jobId: string, signal?: AbortSignal) => {
      try {
        const service = await getTurboRunsService();
        const next = await service.getRewriteJob(jobTurboRunId, jobId, signal);
        if (!signal?.aborted) applyJob(next);
      } catch (error) {
        if (!signal?.aborted)
          logger.error('Batch rewrite refresh failed', error);
      }
    },
    [applyJob, getTurboRunsService],
  );

  // A reloaded page, or a switch back to this batch, resumes its running job.
  useEffect(() => {
    setJob(null);
    setIsCancelling(false);
    if (!turboRunId) return;
    const controller = new AbortController();
    const loadActiveJob = async () => {
      try {
        const service = await getTurboRunsService();
        const active = await service.getActiveRewriteJob(
          turboRunId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        seenCompletedCount.current = active?.completedItemIds.length ?? 0;
        setJob(active);
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Loading the active batch rewrite failed', error);
        }
      }
    };
    void loadActiveJob();
    return () => controller.abort();
  }, [turboRunId, getTurboRunsService]);

  const jobId = job?.id ?? null;
  const jobTurboRunId = job?.turboRunId ?? null;

  useEffect(() => {
    if (!isReady || !jobId || !jobTurboRunId) return;
    const controller = new AbortController();
    const unsubscribe = subscribe<IBackgroundTaskUpdateEvent>(
      'background-task-update',
      (event) => {
        if (event?.taskId !== jobId) return;
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => {
          void refreshJob(jobTurboRunId, jobId, controller.signal);
        }, REFRESH_DEBOUNCE_MS);
      },
    );
    // Catch up on anything that finished before the subscription existed.
    void refreshJob(jobTurboRunId, jobId, controller.signal);
    return () => {
      controller.abort();
      unsubscribe();
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [isReady, jobTurboRunId, jobId, refreshJob, subscribe]);

  // Events sent while the socket was down are gone; read the job again.
  useEffect(() => {
    const previous = previousConnectionState.current;
    previousConnectionState.current = connectionState;
    if (
      connectionState === 'connected' &&
      (previous === 'offline' || previous === 'reconnecting') &&
      jobId &&
      jobTurboRunId
    ) {
      void refreshJob(jobTurboRunId, jobId);
    }
  }, [connectionState, jobTurboRunId, jobId, refreshJob]);

  const startRewrite = useCallback(
    async (itemIds: string[]): Promise<boolean> => {
      if (!turboRunId || job || isStarting || itemIds.length === 0) return false;
      setIsStarting(true);
      try {
        const service = await getTurboRunsService();
        const created = await service.createRewriteJob(turboRunId, itemIds);
        seenCompletedCount.current = 0;
        setJob(created);
        return true;
      } catch (error) {
        logger.error('Queueing the batch rewrite failed', error);
        notifications.error(translate('error'));
        return false;
      } finally {
        setIsStarting(false);
      }
    },
    [turboRunId, getTurboRunsService, isStarting, job, notifications, translate],
  );

  const cancelRewrite = useCallback(async () => {
    if (!job || isCancelling) return;
    setIsCancelling(true);
    try {
      const service = await getTurboRunsService();
      applyJob(await service.cancelRewriteJob(job.turboRunId, job.id));
    } catch (error) {
      setIsCancelling(false);
      logger.error('Cancelling the batch rewrite failed', error);
      notifications.error(translate('cancelError'));
    }
  }, [
    applyJob,
    getTurboRunsService,
    isCancelling,
    job,
    notifications,
    translate,
  ]);

  const rewritingIds = useMemo<ReadonlySet<string>>(() => {
    if (!job) return new Set();
    const handled = new Set([
      ...job.completedItemIds,
      ...job.failedItems.map((failure) => failure.itemId),
    ]);
    return new Set(job.itemIds.filter((itemId) => !handled.has(itemId)));
  }, [job]);

  const rewriteProgress = useMemo<ReviewRewriteProgressProps | null>(
    () =>
      job
        ? {
            isCancelling: isCancelling || job.isCancelRequested,
            job,
            onCancel: () => {
              void cancelRewrite();
            },
          }
        : null,
    [cancelRewrite, isCancelling, job],
  );

  return {
    isRewriteStarting: isStarting,
    rewriteProgress,
    rewritingIds,
    startRewrite,
  };
}
