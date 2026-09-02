'use client';

import { ReleaseStatus } from '@genfeedai/contracts';
import type {
  RecurrenceInput,
  RecurrencePreviewResult,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  IRecurrenceRule,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import {
  fromDateTimeLocalInput,
  toDateTimeLocalInput,
} from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useMemo, useState } from 'react';

type EvergreenSeriesControlsProps = {
  groupId: string;
};

function scheduledDateToISOString(value: string, timezone: string): string {
  const isoString = fromDateTimeLocalInput(value, timezone);
  if (!isoString) {
    throw new Error('The next occurrence date is invalid.');
  }

  return isoString;
}

function recurrenceInput(rule: IRecurrenceRule): RecurrenceInput {
  return {
    ...(rule.endDate ? { endDate: rule.endDate } : {}),
    frequency: rule.frequency,
    interval: rule.interval,
    ...(rule.maxRepeats ? { maxRepeats: rule.maxRepeats } : {}),
    ...(rule.weekdays.length ? { weekdays: rule.weekdays } : {}),
  };
}

function actionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The series action failed.';
}

export default function EvergreenSeriesControls({
  groupId,
}: EvergreenSeriesControlsProps): React.JSX.Element {
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getReleaseGroupsService = useAuthedService((token: string) =>
    ReleaseGroupsService.getInstance(token),
  );
  const [release, setRelease] = useState<IReleaseGroup | null>(null);
  const [preview, setPreview] = useState<RecurrencePreviewResult | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);

  const loadRelease = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      setRelease(null);
      setPreview(null);
      setScheduledDate('');
      setIsConfirmingCancel(false);
      setPendingAction(null);
      try {
        const service = await getReleaseGroupsService();
        const nextRelease = await service.getOne(groupId, signal);
        if (signal?.aborted) {
          return;
        }
        setRelease(nextRelease);
        setScheduledDate(
          toDateTimeLocalInput(nextRelease.scheduledAt, nextRelease.timezone),
        );
      } catch (loadError) {
        if (!signal?.aborted) {
          setError(actionErrorMessage(loadError));
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getReleaseGroupsService, groupId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadRelease(controller.signal);
    return () => controller.abort();
  }, [loadRelease]);

  useEffect(() => {
    const activeRelease = release;
    const rule = activeRelease?.recurrence;
    if (!activeRelease || !rule || !scheduledDate) {
      setPreview(null);
      return;
    }

    const controller = new AbortController();
    setPreview(null);
    const loadPreview = async () => {
      try {
        const service = await getReleaseGroupsService();
        const result = await service.preview(
          {
            limit: 3,
            recurrence: recurrenceInput(rule),
            repeatCount: rule.repeatCount,
            startAt: scheduledDateToISOString(
              scheduledDate,
              activeRelease.timezone,
            ),
            timezone: activeRelease.timezone,
          },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setPreview(result);
        }
      } catch (previewError) {
        if (!controller.signal.aborted) {
          setPreview({
            issues: [
              {
                code: 'invalid_input',
                message: actionErrorMessage(previewError),
              },
            ],
            success: false,
          });
        }
      }
    };

    void loadPreview();
    return () => controller.abort();
  }, [getReleaseGroupsService, release, scheduledDate]);

  const runAction = useCallback(
    async (
      action: string,
      mutation: (service: ReleaseGroupsService) => Promise<IReleaseGroup>,
      successMessage: string,
    ) => {
      setPendingAction(action);
      setError(null);
      try {
        const service = await getReleaseGroupsService();
        const nextRelease = await mutation(service);
        setRelease(nextRelease);
        setScheduledDate(
          toDateTimeLocalInput(nextRelease.scheduledAt, nextRelease.timezone),
        );
        setIsConfirmingCancel(false);
        notifications.success(successMessage);
      } catch (actionError) {
        const message = actionErrorMessage(actionError);
        setError(message);
        notifications.error(message);
      } finally {
        setPendingAction(null);
      }
    },
    [getReleaseGroupsService, notifications],
  );

  if (isLoading) {
    return (
      <aside
        aria-label="Evergreen series controls"
        className="fixed right-4 bottom-4 z-50 w-80 border border-border bg-background p-4 shadow-xl"
      >
        <p className="text-sm text-muted-foreground">Loading series…</p>
      </aside>
    );
  }

  if (error && !release) {
    return (
      <aside
        aria-label="Evergreen series controls"
        className="fixed right-4 bottom-4 z-50 w-80 border border-destructive/40 bg-background p-4 shadow-xl"
      >
        <p className="font-medium">Series controls unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button
          className="mt-3"
          label="Retry"
          onClick={() => void loadRelease()}
        />
      </aside>
    );
  }

  if (!release?.recurrence) {
    return (
      <aside
        aria-label="Evergreen series controls"
        className="fixed right-4 bottom-4 z-50 w-80 border border-border bg-background p-4 shadow-xl"
      >
        <p className="font-medium">One-off post</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This post has no evergreen recurrence rule.
        </p>
      </aside>
    );
  }

  const rule = release.recurrence;
  const isExhausted = rule.isExhausted === true;
  const isPaused =
    rule.isPaused === true || release.status === ReleaseStatus.PAUSED;
  const isBlocked = !release.scheduledAt;
  const isPending = pendingAction !== null;

  return (
    <aside
      aria-label="Evergreen series controls"
      className="fixed right-4 bottom-4 z-50 w-80 space-y-4 border border-border bg-background p-4 shadow-xl"
    >
      <div>
        <p className="font-medium">Evergreen series</p>
        <p className="text-sm text-muted-foreground">
          {isExhausted
            ? 'Series complete — no future occurrences remain.'
            : isPaused
              ? 'Paused — published history is unchanged.'
              : isBlocked
                ? 'Blocked — add a future schedule before editing.'
                : `${rule.frequency} · occurrence ${rule.repeatCount + 1}`}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!isExhausted ? (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="series-next-date">
              Next occurrence
            </label>
            <Input
              id="series-next-date"
              type="datetime-local"
              value={scheduledDate}
              disabled={isBlocked || isPending}
              onChange={(event) => setScheduledDate(event.target.value)}
            />
            <Button
              isDisabled={isBlocked || isPending || !scheduledDate}
              isLoading={pendingAction === 'edit'}
              label="Save future schedule"
              onClick={() =>
                void runAction(
                  'edit',
                  (service) =>
                    service.editFuture(groupId, {
                      scheduledDate: scheduledDateToISOString(
                        scheduledDate,
                        release.timezone,
                      ),
                    }),
                  'Future occurrence updated',
                )
              }
            />
          </div>

          {preview?.success ? (
            <div>
              <p className="text-sm font-medium">Upcoming preview</p>
              {preview.occurrences.length ? (
                <ol className="mt-1 list-decimal pl-5 text-sm text-muted-foreground">
                  {preview.occurrences.map((occurrence) => (
                    <li key={occurrence}>
                      {new Date(occurrence).toLocaleString()}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No occurrences remain in this bounded rule.
                </p>
              )}
            </div>
          ) : preview ? (
            <p role="alert" className="text-sm text-destructive">
              {preview.issues.map((issue) => issue.message).join(' ')}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              isDisabled={isPending}
              isLoading={pendingAction === 'toggle'}
              label={isPaused ? 'Resume series' : 'Pause series'}
              onClick={() =>
                void runAction(
                  'toggle',
                  (service) =>
                    isPaused
                      ? service.resumeFuture(groupId)
                      : service.pauseFuture(groupId),
                  isPaused
                    ? 'Evergreen series resumed'
                    : 'Evergreen series paused',
                )
              }
            />
            {!isConfirmingCancel ? (
              <Button
                isDisabled={isPending}
                label="Cancel future occurrences"
                onClick={() => setIsConfirmingCancel(true)}
              />
            ) : (
              <>
                <Button
                  isDisabled={isPending}
                  label="Keep series"
                  onClick={() => setIsConfirmingCancel(false)}
                />
                <Button
                  isDisabled={isPending}
                  isLoading={pendingAction === 'cancel'}
                  label="Confirm cancellation"
                  onClick={() =>
                    void runAction(
                      'cancel',
                      (service) => service.cancelFuture(groupId),
                      'Future occurrences cancelled',
                    )
                  }
                />
              </>
            )}
          </div>
        </>
      ) : null}
    </aside>
  );
}
