import { Progress } from '@ui/primitives/progress';
import { Stepper } from '@ui/primitives/stepper';
import type { OnboardingProgressProps } from '@/features/onboarding/props/onboarding-progress.props';

export default function OnboardingProgress({
  orientation = 'horizontal',
  onStepChange,
  disabledSteps = [],
  currentStep,
  totalSteps,
  stepLabels,
}: OnboardingProgressProps) {
  const progressPercent =
    totalSteps > 1 ? (currentStep / (totalSteps - 1)) * 100 : 100;

  return (
    <div className="w-full">
      <Progress
        value={progressPercent}
        aria-label="Onboarding progress"
        aria-valuemin={0}
        aria-valuemax={Math.max(totalSteps - 1, 1)}
        aria-valuenow={Math.min(currentStep, Math.max(totalSteps - 1, 1))}
        className="mb-6"
        size="xs"
      />

      <Stepper
        currentStep={currentStep}
        onStepSelect={onStepChange}
        orientation={orientation}
        steps={stepLabels.map((label, index) => ({
          id: label,
          isDisabled: disabledSteps.includes(index),
          label,
        }))}
      />
    </div>
  );
}
