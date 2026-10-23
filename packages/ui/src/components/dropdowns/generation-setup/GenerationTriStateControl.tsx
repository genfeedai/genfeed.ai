'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  GenerationTriStateControlProps,
  GenerationTriStateValue,
} from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

/**
 * Inherit / On / Off, the one control every Brand-popover row uses. While
 * Inherit is selected the segment the setting resolves to is outlined, so the
 * current effective value is never hidden behind "Inherit".
 */
export default function GenerationTriStateControl({
  ariaLabel,
  isDisabled,
  onChange,
  resolvedValue,
  value,
}: GenerationTriStateControlProps) {
  const translate = useTranslations('ui.generationHarness');
  const resolvedDescriptionId = useId();
  const options: ReadonlyArray<{
    label: string;
    value: GenerationTriStateValue;
  }> = [
    { label: translate('inherit'), value: null },
    { label: translate('on'), value: true },
    { label: translate('off'), value: false },
  ];

  return (
    <div
      aria-describedby={value === null ? resolvedDescriptionId : undefined}
      aria-label={ariaLabel}
      className="grid w-full grid-cols-3 gap-1"
      role="group"
    >
      {value === null ? (
        <span className="sr-only" id={resolvedDescriptionId}>
          {translate(resolvedValue ? 'currentlyOn' : 'currentlyOff')}
        </span>
      ) : null}
      {options.map((option) => {
        const isSelected = value === option.value;
        const isResolved =
          value === null &&
          option.value !== null &&
          option.value === resolvedValue;

        return (
          <Button
            key={option.label}
            aria-pressed={isSelected}
            className={cn('w-full', isResolved && 'ring-1 ring-border')}
            isDisabled={isDisabled}
            onClick={() => onChange(option.value)}
            size={ButtonSize.SM}
            variant={isSelected ? ButtonVariant.SECONDARY : ButtonVariant.GHOST}
            withWrapper={false}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
