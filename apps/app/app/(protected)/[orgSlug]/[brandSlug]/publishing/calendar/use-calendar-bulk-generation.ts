import type { CalendarBulkGenerationOptions } from '@props/publishing/content-calendar-controller.props';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mutationErrorMessage } from '@/features/posts/release/release-mutation-runner';

export function useCalendarBulkGeneration({
  getPostingCadencesService,
  setSlots,
  setSelectedSlot,
  notificationsService,
  openConfirm,
  translate,
}: CalendarBulkGenerationOptions) {
  const [isBulkPending, setIsBulkPending] = useState(false);
  const bulkAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      bulkAbortRef.current?.abort();
    };
  }, []);

  const isAbortError = useCallback((error: unknown): boolean => {
    return (
      (error instanceof Error && error.name === 'CanceledError') ||
      (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ERR_CANCELED')
    );
  }, []);

  const runBulkGenerate = useCallback(
    async (identityKeys: string[]): Promise<void> => {
      if (identityKeys.length === 0) {
        return;
      }

      bulkAbortRef.current?.abort();
      const abort = new AbortController();
      bulkAbortRef.current = abort;
      setIsBulkPending(true);

      try {
        const service = await getPostingCadencesService();
        const result = await service.generateBulk(
          {
            confirmedCount: identityKeys.length,
            identityKeys,
          },
          abort.signal,
        );
        const completedKeys = new Set(
          result.completed.map((slot) => slot.identityKey),
        );
        setSlots((current) =>
          current.filter((slot) => !completedKeys.has(slot.identityKey)),
        );
        setSelectedSlot((current) =>
          current && completedKeys.has(current.identityKey) ? null : current,
        );

        if (result.isCreditsExhausted) {
          notificationsService.error(
            translate('bulkGenerateCreditsStop', {
              completed: result.completedCount,
              remaining: result.remainingCount,
              total: identityKeys.length,
            }),
          );
          return;
        }

        if (result.isCancelled) {
          return;
        }

        if (result.remainingCount > 0) {
          notificationsService.success(
            translate('bulkGeneratePartial', {
              completed: result.completedCount,
              remaining: result.remainingCount,
              total: identityKeys.length,
            }),
          );
          return;
        }

        notificationsService.success(
          translate('bulkGenerateSuccess', { count: result.completedCount }),
        );
      } catch (error) {
        if (abort.signal.aborted || isAbortError(error)) {
          return;
        }
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        if (bulkAbortRef.current === abort) {
          bulkAbortRef.current = null;
        }
        setIsBulkPending(false);
      }
    },
    [
      getPostingCadencesService,
      isAbortError,
      notificationsService,
      translate,
      setSlots,
      setSelectedSlot,
    ],
  );

  const confirmBulkGenerate = useCallback(
    (identityKeys: string[]): void => {
      if (identityKeys.length === 0 || isBulkPending) {
        return;
      }

      openConfirm({
        confirmLabel: translate('bulkGenerateConfirm', {
          count: identityKeys.length,
        }),
        label: translate('bulkGenerateConfirmTitle', {
          count: identityKeys.length,
        }),
        message: translate('bulkGenerateConfirmMessage', {
          count: identityKeys.length,
        }),
        onConfirm: () => {
          void runBulkGenerate(identityKeys);
        },
      });
    },
    [isBulkPending, openConfirm, runBulkGenerate, translate],
  );

  return { isBulkPending, bulkAbortRef, confirmBulkGenerate };
}
