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
 * Default / On / Off, the one control every Brand-popover row uses. While
 * Default is selected the segment the setting resolves to is outlined, so the
 * current effective value is never hidden behind "Default". `hasInherit` false
 * drops the Default segment for a setting with nothing to inherit from.
 */
export default function GenerationTriStateControl({
  ariaLabel,
  hasInherit = true,
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
    ...(hasInherit
      ? [{ label: translate('inherit'), value: null } as const]
      : []),
    { label: translate('on'), value: true },
    { label: translate('off'), value: false },
  ];

  return (
    <div
      aria-describedby={value === null ? resolvedDescriptionId : undefined}
      aria-label={ariaLabel}
      className={cn(
        'grid w-full gap-1',
        hasInherit ? 'grid-cols-3' : 'grid-cols-2',
      )}
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
