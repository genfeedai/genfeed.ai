import { ButtonVariant } from '@genfeedai/contracts';
import { Progress } from '@ui/primitives';
import { Button } from '@ui/primitives/button';
import { Check } from 'lucide-react';
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
        className="h-1 bg-tertiary rounded-full overflow-hidden mb-6"
      />

      <div
        className={
          orientation === 'vertical'
            ? 'flex flex-col gap-1'
            : 'flex justify-between'
        }
      >
        {stepLabels.map((label, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          const className =
            orientation === 'vertical'
              ? 'flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left ' +
                (isCurrent ? 'bg-hover' : '')
              : 'flex items-center gap-2';
          const content = (
            <>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold transition-colors duration-300 ${
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'bg-hover text-foreground border border-border-strong'
                      : 'bg-tertiary text-gray-800 border border-border'
                }`}
              >
                {isCompleted ? <Check className="size-3.5" /> : index + 1}
              </div>

              {/* Label — hidden on mobile for non-current steps */}
              <span
                className={`text-xs font-medium transition-colors duration-300 hidden md:inline ${
                  isCurrent
                    ? 'text-foreground'
                    : isCompleted
                      ? 'text-muted-foreground'
                      : 'text-gray-800'
                }`}
              >
                {label}
              </span>
            </>
          );
          return onStepChange ? (
            <Button
              key={label}
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              className={className}
              aria-current={isCurrent ? 'step' : undefined}
              isDisabled={disabledSteps.includes(index)}
              onClick={() => onStepChange(index)}
            >
              {content}
            </Button>
          ) : (
            <div
              key={label}
              className={className}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
