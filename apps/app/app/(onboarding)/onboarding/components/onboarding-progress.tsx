'use client';

import type { OnboardingProgressProps } from '@props/onboarding/onboarding-progress.props';
import { Progress } from '@ui/primitives';
import { HiCheck } from 'react-icons/hi2';

export default function OnboardingProgress({
  currentStep,
  totalSteps,
  stepLabels,
}: OnboardingProgressProps) {
  const progressPercent =
    totalSteps > 1 ? (currentStep / (totalSteps - 1)) * 100 : 100;

  return (
    <div className="w-full">
      {/* Progress bar */}
      <Progress
        value={progressPercent}
        aria-label="Onboarding progress"
        aria-valuemin={0}
        aria-valuemax={Math.max(totalSteps - 1, 1)}
        aria-valuenow={Math.min(currentStep, Math.max(totalSteps - 1, 1))}
        className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-6"
      />

      {/* Step labels */}
      <div className="flex justify-between">
        {stepLabels.map((label, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <div key={label} className="flex items-center gap-2">
              {/* Step indicator */}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                  isCompleted
                    ? 'bg-white text-black'
                    : isCurrent
                      ? 'bg-white/20 text-white border border-white/40'
                      : 'bg-white/[0.06] text-white/30 border border-white/[0.08]'
                }`}
              >
                {isCompleted ? <HiCheck className="size-3.5" /> : index + 1}
              </div>

              {/* Label — hidden on mobile for non-current steps */}
              <span
                className={`text-xs font-medium transition-colors duration-300 hidden md:inline ${
                  isCurrent
                    ? 'text-white'
                    : isCompleted
                      ? 'text-white/60'
                      : 'text-white/20'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
