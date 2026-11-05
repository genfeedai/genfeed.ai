'use client';

import type {
  ModalPostComposerStep,
  ModalPostComposerStepperProps,
} from '@genfeedai/props/modals/modal.props';
import { Stepper } from '@ui/primitives/stepper';
import { useTranslations } from 'next-intl';

const STEPS: ModalPostComposerStep[] = ['channels', 'content'];

/**
 * The composer's two steps, in one line: where the post goes, then what it
 * says. The finished step is ticked and stays clickable to go back.
 */
export default function ModalPostComposerStepper({
  step,
  onStepChange,
}: ModalPostComposerStepperProps) {
  const translate = useTranslations('ui.postComposer.steps');
  const currentStep = STEPS.indexOf(step);

  return (
    <nav aria-label={translate('label')}>
      <Stepper
        currentStep={currentStep}
        onStepSelect={(index) => {
          const target = STEPS[index];
          if (target) onStepChange(target);
        }}
        steps={STEPS.map((value, index) => ({
          id: value,
          isDisabled: index > currentStep,
          label: translate(value),
        }))}
      />
    </nav>
  );
}
