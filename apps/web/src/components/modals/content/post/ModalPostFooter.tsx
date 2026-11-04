'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ModalPostFooterProps } from '@genfeedai/props/modals/modal.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { PUBLISH_SUBMIT_ATTRIBUTE } from './publish-submit';

export default function ModalPostFooter({
  activeTab,
  isLoading,
  globalScheduledDate,
  globalDescription,
  hasYoutube,
  globalLabel,
  onNextStep,
  onPreviousStep,
  onClose,
  isFormValid = false,
}: Omit<ModalPostFooterProps, 'onSubmit'>) {
  const translate = useTranslations('ui.postBatch.footer');

  // Each step owns its own keyed actions row. Without distinct keys React
  // reuses the Next button's DOM node as the Publish submit button during the
  // same click, which flips it to type="submit" before the browser runs the
  // click's default action and submits the form.
  if (activeTab === 'setup') {
    return (
      <ModalActions key="setup-actions">
        <Button
          type="button"
          label={translate('cancel')}
          variant={ButtonVariant.SECONDARY}
          onClick={onClose}
          isLoading={isLoading}
        />

        <Button
          type="button"
          label={translate('next')}
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
        label={translate('back')}
        variant={ButtonVariant.SECONDARY}
        onClick={onPreviousStep}
        isLoading={isLoading}
      />

      <Button
        type="submit"
        {...{ [PUBLISH_SUBMIT_ATTRIBUTE]: 'true' }}
        label={translate('schedule')}
        variant={ButtonVariant.DEFAULT}
        isLoading={isLoading}
        isDisabled={isLoading || !isFormValid}
      />
    </ModalActions>
  );
}
