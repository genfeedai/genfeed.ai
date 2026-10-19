'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ModalPostSimpleActionsProps } from '@genfeedai/props/modals/modal.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import FormDateTimePicker from '@ui/primitives/date-time-picker';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function ModalPostSimpleActions({
  isSubmitting,
  isOverLimit,
  isTitleError,
  isFormValid,
  isEditMode,
  isThreadReply,
  isHandoff = false,
  isThread = false,
  hasPublishChoices = false,
  hasAccount = false,
  browserTimezone,
  scheduledDate = '',
  onScheduledDateChange,
  onSaveDraft,
  onPublishNow,
  onSchedule,
  onContinue,
  showViewDetailsButton,
  onViewDetails,
  onViewDetailsClick,
  onCancel,
}: ModalPostSimpleActionsProps) {
  const translate = useTranslations('ui.postComposer');
  const [isSchedulePickerOpen, setIsSchedulePickerOpen] = useState(false);
  const isBlocked = isSubmitting || isOverLimit || isTitleError || !isFormValid;
  const submitLabel = (() => {
    if (isSubmitting) {
      return 'Saving…';
    }
    if (isEditMode) {
      return 'Save';
    }
    if (isThreadReply) {
      return 'Add Reply';
    }
    if (isThread) {
      return translate('createThread');
    }
    return translate('saveDraft');
  })();

  return (
    <ModalActions>
      {hasPublishChoices && !isHandoff && isSchedulePickerOpen ? (
        <div className="w-full space-y-2">
          <p className="text-sm font-medium">{translate('scheduleAt')}</p>
          <FormDateTimePicker
            value={scheduledDate}
            timezone={browserTimezone}
            onChange={(value) =>
              onScheduledDateChange?.(value ? value.toISOString() : '')
            }
          />
        </div>
      ) : null}
      {hasPublishChoices && !isHandoff && !hasAccount ? (
        <p className="w-full text-xs text-foreground/60">
          {translate('scheduleNeedsAccount')}
        </p>
      ) : null}
      <div className="flex justify-between w-full">
        <div className="flex gap-2">
          {showViewDetailsButton && onViewDetails && (
            <Button
              type="button"
              label="View Details"
              variant={ButtonVariant.SECONDARY}
              onClick={onViewDetailsClick}
              isDisabled={isSubmitting}
            />
          )}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={onCancel}
            isDisabled={isSubmitting}
          />

          {isHandoff ? (
            <Button
              type="button"
              label={translate('continue')}
              variant={ButtonVariant.DEFAULT}
              onClick={onContinue}
            />
          ) : hasPublishChoices ? (
            <>
              <Button
                type="button"
                label={translate('saveDraft')}
                variant={ButtonVariant.SECONDARY}
                onClick={onSaveDraft}
                isDisabled={isBlocked}
              />
              {isSchedulePickerOpen ? (
                <Button
                  type="button"
                  label={translate('confirmSchedule')}
                  variant={ButtonVariant.SECONDARY}
                  onClick={onSchedule}
                  isDisabled={isBlocked || !hasAccount || !scheduledDate}
                />
              ) : (
                <Button
                  type="button"
                  label={translate('schedule')}
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => setIsSchedulePickerOpen(true)}
                  isDisabled={isBlocked || !hasAccount}
                />
              )}
              <Button
                type="button"
                label={translate('publishNow')}
                variant={ButtonVariant.DEFAULT}
                onClick={onPublishNow}
                isDisabled={isBlocked || !hasAccount}
              />
            </>
          ) : (
            <Button
              type="submit"
              label={submitLabel}
              variant={ButtonVariant.DEFAULT}
              isDisabled={isBlocked}
            />
          )}
        </div>
      </div>
    </ModalActions>
  );
}
