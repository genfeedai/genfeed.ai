'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ModalPostFooterProps } from '@genfeedai/props/modals/modal.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import { PUBLISH_SUBMIT_ATTRIBUTE } from './publish-submit';

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
  // Each step owns its own keyed actions row. Without distinct keys React
  // reuses the Next button's DOM node as the Publish submit button during the
  // same click, which flips it to type="submit" before the browser runs the
  // click's default action and submits the form.
  if (activeTab === 'setup') {
    return (
      <ModalActions key="setup-actions">
        <Button
          type="button"
          label="Cancel"
          variant={ButtonVariant.SECONDARY}
          onClick={onClose}
          isLoading={isLoading}
        />

        <Button
          type="button"
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
    <ModalActions key="platforms-actions">
      <Button
        type="button"
        label="Back"
        variant={ButtonVariant.SECONDARY}
        onClick={onPreviousStep}
        isLoading={isLoading}
      />

      <Button
        type="submit"
        {...{ [PUBLISH_SUBMIT_ATTRIBUTE]: 'true' }}
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
