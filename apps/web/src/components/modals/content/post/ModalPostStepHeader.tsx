'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ModalPostStepHeaderProps } from '@genfeedai/props/modals/modal.props';
import { Button } from '@ui/primitives/button';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Header of the two-step publish modal. The details step introduces the post;
 * the channels step adds a back arrow to return to it.
 */
export default function ModalPostStepHeader({
  activeTab,
  onBack,
}: ModalPostStepHeaderProps) {
  const translate = useTranslations('ui.postBatch.stepHeader');
  const isDetailsStep = activeTab === 'setup';

  return (
    <div className="relative flex flex-col items-center gap-1 pb-2 text-center">
      {isDetailsStep ? null : (
        <Button
          type="button"
          ariaLabel={translate('back')}
          className="absolute left-0 top-0"
          icon={<ArrowLeft className="size-4" />}
          onClick={onBack}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      )}
      <h2 className="text-xl font-semibold">
        {isDetailsStep ? translate('detailsTitle') : translate('channelsTitle')}
      </h2>
      <p className="text-sm text-foreground/70">
        {isDetailsStep
          ? translate('detailsDescription')
          : translate('channelsDescription')}
      </p>
    </div>
  );
}
