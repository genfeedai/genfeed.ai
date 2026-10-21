'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { FirstDraftsScheduleProps } from '@genfeedai/props/onboarding/first-drafts.props';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { useTranslations } from 'next-intl';
import { useScheduleStep } from './use-schedule-step';

/**
 * The step after "yes, I'd post this": connect the account each liked draft is
 * for, then schedule them all at once. Nothing is published before this click.
 */
export default function ScheduleStep(props: FirstDraftsScheduleProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const state = useScheduleStep(props);

  if (state.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner ariaLabel={t('loading')} className="size-6 text-foreground" />
      </div>
    );
  }

  const readyCount = state.rows.filter((row) => row.state === 'ready').length;
  const isDone =
    state.rows.length > 0 &&
    state.rows.every((row) => row.state === 'scheduled');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{t('schedule.title')}</h1>
        <p className="text-muted-foreground">{t('schedule.description')}</p>
      </div>

      <ul className="flex flex-col gap-3">
        {state.rows.map((row) => {
          const platform = t(`platforms.${row.draft.platform}`);
          return (
            <li
              key={row.draft.postId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{platform}</span>
                <span className="line-clamp-2 text-sm text-muted-foreground">
                  {row.draft.text}
                </span>
                {row.scheduledAt ? (
                  <span className="text-xs text-muted-foreground">
                    {t('schedule.when', {
                      date: new Date(row.scheduledAt).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}
                  </span>
                ) : null}
              </div>
              {row.state === 'connect' ? (
                <Button
                  label={t('schedule.connect', { platform })}
                  onClick={() => state.connect(row.draft.platform)}
                />
              ) : (
                <span
                  role="status"
                  className={
                    row.state === 'failed'
                      ? 'text-sm text-destructive'
                      : 'text-sm text-muted-foreground'
                  }
                >
                  {t(`schedule.state.${row.state}`)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {isDone ? (
          <Button
            label={t('schedule.finish')}
            isLoading={props.isFinishing}
            onClick={props.onFinish}
          />
        ) : (
          <>
            <Button
              label={t('schedule.submit', { count: readyCount })}
              isDisabled={readyCount === 0}
              isLoading={state.isScheduling}
              onClick={state.schedule}
            />
            <Button
              label={t('schedule.skip')}
              variant={ButtonVariant.GHOST}
              isDisabled={state.isScheduling}
              onClick={props.onFinish}
            />
          </>
        )}
      </div>
    </div>
  );
}
