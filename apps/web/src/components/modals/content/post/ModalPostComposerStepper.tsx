'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  ModalPostComposerStep,
  ModalPostComposerStepperProps,
} from '@genfeedai/props/modals/modal.props';
import { Button } from '@ui/primitives/button';
import { Check } from 'lucide-react';
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
  const currentIndex = STEPS.indexOf(step);

  return (
    <nav aria-label={translate('label')} className="flex items-center gap-3">
      {STEPS.map((value, index) => {
        const isCurrent = value === step;
        const isDone = index < currentIndex;

        return (
          <div className="flex items-center gap-3" key={value}>
            {index > 0 ? (
              <span aria-hidden="true" className="h-px w-7 bg-border" />
            ) : null}
            <Button
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-2 text-sm font-medium',
                isCurrent ? 'text-foreground' : 'text-foreground/60',
              )}
              isDisabled={!isDone && !isCurrent}
              onClick={() => onStepChange(value)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-2xs',
                  isCurrent && 'bg-foreground text-background',
                  isDone && 'bg-success/15 text-success',
                  !isCurrent && !isDone && 'shadow-border',
                )}
              >
                {isDone ? <Check className="size-3" /> : index + 1}
              </span>
              {translate(value)}
            </Button>
          </div>
        );
      })}
    </nav>
  );
}
