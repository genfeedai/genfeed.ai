'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { Check } from 'lucide-react';
import type { ComponentPropsWithRef } from 'react';
import { Button } from './button';
import {
  type StepStatus,
  stepIndicatorVariants,
  stepLabelVariants,
  stepperVariants,
  stepVariants,
} from './stepper.variants';

export interface StepperStep {
  id: string;
  label: string;
  /** Only meaningful with `onStepSelect`: the step cannot be picked. */
  isDisabled?: boolean;
}

export interface StepperProps
  extends Omit<ComponentPropsWithRef<'ol'>, 'children'> {
  steps: readonly StepperStep[];
  /** Zero-based index of the current step. Earlier steps are complete. */
  currentStep: number;
  orientation?: 'horizontal' | 'vertical';
  /** When set, every step renders as a button that calls this with its index. */
  onStepSelect?: (index: number) => void;
}

function getStepStatus(index: number, currentStep: number): StepStatus {
  if (index < currentStep) return 'complete';
  return index === currentStep ? 'current' : 'upcoming';
}

function Stepper({
  ref,
  steps,
  currentStep,
  orientation = 'horizontal',
  onStepSelect,
  className,
  ...props
}: StepperProps) {
  return (
    <ol
      ref={ref}
      className={cn(stepperVariants({ orientation }), className)}
      {...props}
    >
      {steps.map((step, index) => {
        const status = getStepStatus(index, currentStep);
        const isCurrent = status === 'current';
        const stepClassName = stepVariants({ isCurrent, orientation });
        const content = (
          <>
            <span className={stepIndicatorVariants({ status })}>
              {status === 'complete' ? (
                <Check aria-hidden="true" className="size-3.5" />
              ) : (
                index + 1
              )}
            </span>
            <span className={stepLabelVariants({ orientation, status })}>
              {step.label}
            </span>
          </>
        );

        return (
          <li
            key={step.id}
            className={orientation === 'vertical' ? 'w-full' : undefined}
          >
            {onStepSelect ? (
              <Button
                aria-current={isCurrent ? 'step' : undefined}
                ariaLabel={step.label}
                className={stepClassName}
                isDisabled={step.isDisabled}
                onClick={() => onStepSelect(index)}
                textTransform="none"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                {content}
              </Button>
            ) : (
              <div
                aria-current={isCurrent ? 'step' : undefined}
                className={stepClassName}
              >
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export { Stepper };
