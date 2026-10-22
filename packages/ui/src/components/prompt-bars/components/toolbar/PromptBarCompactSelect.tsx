'use client';

import type { PromptBarCompactSelectProps } from '@genfeedai/props/prompt-bars/prompt-bar-send-button.props';
import { ghostSelectTriggerClassName } from '@ui/primitives/field-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement } from 'react';

/** Compact ghost dropdown for prompt-bar toolbars, weighted like the other ghost controls. */
export default function PromptBarCompactSelect({
  ariaLabel,
  isDisabled = false,
  onChange,
  options,
  value,
}: PromptBarCompactSelectProps): ReactElement {
  return (
    <Select disabled={isDisabled} onValueChange={onChange} value={value}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={ghostSelectTriggerClassName}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            disabled={option.isDisabled}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
