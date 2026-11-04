'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ModalPostStepHeaderProps } from '@genfeedai/props/modals/modal.props';
import { Button } from '@ui/primitives/button';
import { ArrowLeft } from 'lucide-react';

/**
 * Header of the two-step publish modal. The details step introduces the post;
 * the channels step adds a back arrow to return to it.
 */
export default function ModalPostStepHeader({
  activeTab,
  onBack,
}: ModalPostStepHeaderProps) {
  const isDetailsStep = activeTab === 'setup';

  return (
    <div className="relative flex flex-col items-center gap-1 pb-2 text-center">
      {isDetailsStep ? null : (
        <Button
          type="button"
          ariaLabel="Back to details"
          className="absolute left-0 top-0"
          icon={<ArrowLeft className="size-4" />}
          onClick={onBack}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      )}
      <h2 className="text-xl font-semibold">
        {isDetailsStep ? 'Schedule post' : 'Choose channels'}
      </h2>
      <p className="text-sm text-foreground/70">
        {isDetailsStep
          ? 'Add the post details and set the time.'
          : 'Choose destinations and customize each channel.'}
      </p>
    </div>
  );
}
