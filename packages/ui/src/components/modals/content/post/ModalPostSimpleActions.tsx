'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { ModalPostSimpleActionsProps } from '@genfeedai/props/modals/modal.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';

export default function ModalPostSimpleActions({
  isSubmitting,
  isOverLimit,
  isTitleError,
  isFormValid,
  isEditMode,
  isThreadReply,
  showViewDetailsButton,
  onViewDetails,
  onViewDetailsClick,
  onCancel,
}: ModalPostSimpleActionsProps) {
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
              variant={ButtonVariant.OUTLINE}
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

          <Button
            type="submit"
            label={submitLabel}
            variant={ButtonVariant.DEFAULT}
            isDisabled={
              isSubmitting || isOverLimit || isTitleError || !isFormValid
            }
          />
        </div>
      </div>
    </ModalActions>
  );
}
