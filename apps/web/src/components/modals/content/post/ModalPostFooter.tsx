'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ModalPostFooterProps } from '@genfeedai/props/modals/modal.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import { useFormatter, useTranslations } from 'next-intl';

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
  const format = useFormatter();

  return (
    <ModalActions className="justify-between">
      <p className="min-w-0 truncate text-xs text-foreground/60">
        {scheduledDate
          ? translate('summary', {
              count: channelCount,
              date: format.dateTime(scheduledDate, {
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                timeZone: scheduleTimezone,
                weekday: 'short',
              }),
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
