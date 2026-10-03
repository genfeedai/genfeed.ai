'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ModalPostSimpleActionsProps } from '@genfeedai/props/modals/modal.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

export default function ModalPostSimpleActions({
  isSubmitting,
  isOverLimit,
  isTitleError,
  isFormValid,
  isEditMode,
  isThreadReply,
  isHandoff = false,
  isThread = false,
  onContinue,
  showViewDetailsButton,
  onViewDetails,
  onViewDetailsClick,
  onCancel,
}: ModalPostSimpleActionsProps) {
  const translate = useTranslations('ui.postComposer');
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
    return 'Create Post';
  })();

  return (
    <ModalActions>
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
          ) : (
            <Button
              type="submit"
              label={submitLabel}
              variant={ButtonVariant.DEFAULT}
              isDisabled={
                isSubmitting || isOverLimit || isTitleError || !isFormValid
              }
            />
          )}
        </div>
      </div>
    </ModalActions>
  );
}
