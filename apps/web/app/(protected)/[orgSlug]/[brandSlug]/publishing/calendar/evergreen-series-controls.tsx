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
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import DateText from '@ui/time/DateText';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import type { EvergreenSeriesControlsProps } from '@/features/posts/props/evergreen-series-controls.props';

function scheduledDateToISOString(
  value: string,
  timezone: string,
  invalidMessage: string,
): string {
  const isoString = fromDateTimeLocalInput(value, timezone);
  if (!isoString) {
    throw new Error(invalidMessage);
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

function actionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** The series controls sit inside the post panel, under its settings. */
const SERIES_PANEL_CLASS = 'border-t border-border p-4';

function evergreenSeriesQueryKey(groupId: string) {
  return ['evergreen-series', groupId] as const;
}

export default function EvergreenSeriesControls({
  groupId,
}: EvergreenSeriesControlsProps): React.JSX.Element | null {
  const translate = useTranslations('pages.publishing.release.series');
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const queryClient = useQueryClient();
  const getReleaseGroupsService = useAuthedService((token: string) =>
    ReleaseGroupsService.getInstance(token),
  );
  // Cached per series: reopening the controls paints the loaded series at
  // once and refreshes it in the background.
  const releaseQuery = useAuthedQuery({
    queryFn: (service, signal) => service.getOne(groupId, signal),
    queryKey: evergreenSeriesQueryKey(groupId),
    service: (token: string) => ReleaseGroupsService.getInstance(token),
  });
  const release = releaseQuery.data ?? null;
  const { refetch: refetchRelease } = releaseQuery;
  const [stateGroupId, setStateGroupId] = useState(groupId);
  const [scheduledDateDraft, setScheduledDateDraft] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);

  // Another series starts with a clean slate: no draft date, confirmation or
  // action error carried over from the previous one.
  if (stateGroupId !== groupId) {
    setStateGroupId(groupId);
    setScheduledDateDraft(null);
    setActionError(null);
    setPendingAction(null);
    setIsConfirmingCancel(false);
  }

  const scheduledDate =
    scheduledDateDraft ??
    (release
      ? toDateTimeLocalInput(release.scheduledAt, release.timezone)
      : '');
  // A failed background refresh keeps the cached series on screen quietly.
  const error =
    actionError ??
    (!release && releaseQuery.error
      ? actionErrorMessage(releaseQuery.error, translate('actionFailed'))
      : null);
  // The skeleton shows only while there is no series to paint: the first
  // read, or a retry after a failed one.
  const isLoading =
    releaseQuery.isPending || (!release && releaseQuery.isFetching);

  const recurrenceRule = release?.recurrence;
  const previewTimezone = release?.timezone ?? '';
  const previewQuery = useAuthedQuery<
    ReleaseGroupsService,
    RecurrencePreviewResult
  >({
    enabled: Boolean(recurrenceRule && scheduledDate),
    queryFn: async (service, signal) => {
      if (!recurrenceRule) {
        throw new Error(translate('noRule'));
      }
      return service.preview(
        {
          limit: 3,
          recurrence: recurrenceInput(recurrenceRule),
          repeatCount: recurrenceRule.repeatCount,
          startAt: scheduledDateToISOString(
            scheduledDate,
            previewTimezone,
            translate('invalidDate'),
          ),
          timezone: previewTimezone,
        },
        signal,
      );
    },
    queryKey: [
      'evergreen-series-preview',
      groupId,
      {
        recurrence: recurrenceRule ? recurrenceInput(recurrenceRule) : null,
        repeatCount: recurrenceRule?.repeatCount ?? null,
        scheduledDate,
        timezone: previewTimezone,
      },
    ],
    // A rejected preview is an answer about the input, not a flaky read.
    retry: false,
    service: (token: string) => ReleaseGroupsService.getInstance(token),
  });
  const preview = previewQuery.data ?? null;
  const previewError = previewQuery.error
    ? actionErrorMessage(previewQuery.error, translate('actionFailed'))
    : preview && !preview.success
      ? preview.issues.map((issue) => issue.message).join(' ')
      : null;

  const runAction = useCallback(
    async (
      action: string,
      mutation: (service: ReleaseGroupsService) => Promise<IReleaseGroup>,
      successMessage: string,
    ) => {
      setPendingAction(action);
      setActionError(null);
      try {
        const service = await getReleaseGroupsService();
        const nextRelease = await mutation(service);
        queryClient.setQueriesData<IReleaseGroup>(
          { queryKey: evergreenSeriesQueryKey(groupId) },
          nextRelease,
        );
        setScheduledDateDraft(null);
        setIsConfirmingCancel(false);
        notifications.success(successMessage);
      } catch (mutationError) {
        const message = actionErrorMessage(
          mutationError,
          translate('actionFailed'),
        );
        setActionError(message);
        notifications.error(message);
      } finally {
        setPendingAction(null);
      }
    },
    [getReleaseGroupsService, groupId, notifications, queryClient, translate],
  );

  if (isLoading) {
    return (
      <aside aria-label={translate('label')} className={SERIES_PANEL_CLASS}>
        <p className="text-sm text-muted-foreground">{translate('loading')}</p>
      </aside>
    );
  }

  if (error && !release) {
    return (
      <aside aria-label={translate('label')} className={SERIES_PANEL_CLASS}>
        <p className="font-medium">{translate('unavailable')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button
          className="mt-3"
          label={translate('retry')}
          onClick={() => void refetchRelease()}
        />
      </aside>
    );
  }

  // A one-off post has no series to control, so it shows nothing.
  if (!release?.recurrence) {
    return null;
  }

  const rule = release.recurrence;
  const isExhausted = rule.isExhausted === true;
  const isPaused =
    rule.isPaused === true || release.status === ReleaseStatus.PAUSED;
  const isBlocked = !release.scheduledAt;
  const isPending = pendingAction !== null;

  return (
    <aside
      aria-label={translate('label')}
      className={`${SERIES_PANEL_CLASS} space-y-4`}
    >
      <div>
        <p className="font-medium">{translate('title')}</p>
        <p className="text-sm text-muted-foreground">
          {isExhausted
            ? translate('complete')
            : isPaused
              ? translate('paused')
              : isBlocked
                ? translate('blocked')
                : translate('recurring', {
                    frequency: translate(`frequency.${rule.frequency}`),
                    number: rule.repeatCount + 1,
                  })}
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
            <Label htmlFor="series-next-date">
              {translate('nextOccurrence')}
            </Label>
            <Input
              id="series-next-date"
              type="datetime-local"
              value={scheduledDate}
              disabled={isBlocked || isPending}
              onChange={(event) => setScheduledDateDraft(event.target.value)}
            />
            <Button
              isDisabled={isBlocked || isPending || !scheduledDate}
              isLoading={pendingAction === 'edit'}
              label={translate('saveSchedule')}
              onClick={() =>
                void runAction(
                  'edit',
                  (service) =>
                    service.editFuture(groupId, {
                      scheduledDate: scheduledDateToISOString(
                        scheduledDate,
                        release.timezone,
                        translate('invalidDate'),
                      ),
                    }),
                  translate('updated'),
                )
              }
            />
          </div>

          {preview?.success ? (
            <div>
              <p className="text-sm font-medium">{translate('upcoming')}</p>
              {preview.occurrences.length ? (
                <ol className="mt-1 list-decimal pl-5 text-sm text-muted-foreground">
                  {preview.occurrences.map((occurrence) => (
                    <li key={occurrence}>
                      <DateText value={occurrence} />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {translate('noOccurrences')}
                </p>
              )}
            </div>
          ) : previewError ? (
            <p role="alert" className="text-sm text-destructive">
              {previewError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              isDisabled={isPending}
              isLoading={pendingAction === 'toggle'}
              label={isPaused ? translate('resume') : translate('pause')}
              onClick={() =>
                void runAction(
                  'toggle',
                  (service) =>
                    isPaused
                      ? service.resumeFuture(groupId)
                      : service.pauseFuture(groupId),
                  isPaused
                    ? translate('resumedToast')
                    : translate('pausedToast'),
                )
              }
            />
            {!isConfirmingCancel ? (
              <Button
                isDisabled={isPending}
                label={translate('cancelFuture')}
                onClick={() => setIsConfirmingCancel(true)}
              />
            ) : (
              <>
                <Button
                  isDisabled={isPending}
                  label={translate('keep')}
                  onClick={() => setIsConfirmingCancel(false)}
                />
                <Button
                  isDisabled={isPending}
                  isLoading={pendingAction === 'cancel'}
                  label={translate('confirmCancel')}
                  onClick={() =>
                    void runAction(
                      'cancel',
                      (service) => service.cancelFuture(groupId),
                      translate('cancelled'),
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
