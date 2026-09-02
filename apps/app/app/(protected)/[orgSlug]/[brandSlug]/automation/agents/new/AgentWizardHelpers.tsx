'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Check } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Choose Type' },
  { id: 2, label: 'Configure' },
  { id: 3, label: 'Review & Launch' },
];

export function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2">
          <span
            className={`flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
              current === step.id
                ? 'bg-foreground text-background'
                : current > step.id
                  ? 'bg-success text-success-foreground'
                  : 'bg-foreground/10 text-foreground/50'
            }`}
          >
            {current > step.id ? <Check className="size-4" /> : step.id}
          </span>
          <span
            className={`text-sm ${current >= step.id ? 'text-foreground' : 'text-foreground/40'}`}
          >
            {step.label}
          </span>
          {i < STEPS.length - 1 && (
            <span className="mx-2 h-px w-6 bg-foreground/10" />
          )}
        </div>
      ))}
    </div>
  );
}

type SelectCardButtonProps = {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

export function SelectCardButton({
  isSelected,
  onClick,
  children,
}: SelectCardButtonProps) {
  return (
    <Button
      aria-pressed={isSelected}
      withWrapper={false}
      variant={ButtonVariant.UNSTYLED}
      onClick={onClick}
      className={`w-full rounded p-4 text-left transition-colors ${
        isSelected
          ? 'bg-tertiary shadow-border-strong'
          : 'shadow-border hover:shadow-border-strong'
      }`}
    >
      {children}
    </Button>
  );
}
