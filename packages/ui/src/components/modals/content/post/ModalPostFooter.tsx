'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { ModalPostFooterProps } from '@genfeedai/props/modals/modal.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';

export default function ModalPostFooter({
  activeTab,
  isLoading,
  enabledCount,
  globalScheduledDate,
  globalDescription,
  hasYoutube,
  globalLabel,
  onNextStep,
  onPreviousStep,
  onClose,
  isFormValid = false,
}: Omit<ModalPostFooterProps, 'onSubmit'>) {
  if (activeTab === 'setup') {
    return (
      <ModalActions>
        <Button
          label="Cancel"
          variant={ButtonVariant.SECONDARY}
          onClick={onClose}
          isLoading={isLoading}
        />

        <Button
          label="Next: Select Platforms"
          variant={ButtonVariant.DEFAULT}
          onClick={onNextStep}
          isDisabled={
            isLoading ||
            !globalScheduledDate ||
            !globalDescription?.trim() ||
            (hasYoutube && !globalLabel?.trim())
          }
        />
      </ModalActions>
    );
  }

  return (
    <ModalActions>
      <Button
        label="Back"
        variant={ButtonVariant.SECONDARY}
        onClick={onPreviousStep}
        isLoading={isLoading}
      />

      <Button
        type="submit"
        label={
          enabledCount > 0
            ? `Publish to ${enabledCount} Platform${enabledCount !== 1 ? 's' : ''}`
            : 'Select Platforms'
        }
        variant={ButtonVariant.DEFAULT}
        isLoading={isLoading}
        isDisabled={isLoading || !isFormValid}
      />
    </ModalActions>
  );
}
