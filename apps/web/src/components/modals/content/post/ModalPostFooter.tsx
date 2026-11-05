'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ModalPostFooterProps } from '@genfeedai/props/modals/modal.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

function formatScheduledDate(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      timeZone,
      weekday: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/**
 * Footer of the schedule modal: what will happen, in one line, then Cancel and
 * Schedule. Schedule is a plain button, so Enter in a field never schedules.
 */
export default function ModalPostFooter({
  isLoading,
  channelCount,
  scheduledDate,
  scheduleTimezone,
  onSchedule,
  onClose,
  isFormValid = false,
}: ModalPostFooterProps) {
  const translate = useTranslations('ui.postBatch.footer');

  return (
    <ModalActions className="justify-between">
      <p className="min-w-0 truncate text-xs text-foreground/60">
        {scheduledDate
          ? translate('summary', {
              count: channelCount,
              date: formatScheduledDate(scheduledDate, scheduleTimezone),
              timezone: scheduleTimezone,
            })
          : translate('summaryNoDate', { count: channelCount })}
      </p>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          label={translate('cancel')}
          variant={ButtonVariant.SECONDARY}
          onClick={onClose}
          isDisabled={isLoading}
        />
        <Button
          type="button"
          label={translate('schedule', { count: channelCount })}
          variant={ButtonVariant.DEFAULT}
          onClick={onSchedule}
          isLoading={isLoading}
          isDisabled={isLoading || !isFormValid}
        />
      </div>
    </ModalActions>
  );
}
