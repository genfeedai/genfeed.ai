'use client';

import type { PromptBarCompactSelectProps } from '@genfeedai/props/prompt-bars/prompt-bar-send-button.props';
import { cn } from '@helpers/formatting/cn/cn.util';
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
  density = 'compact',
  isDisabled = false,
  onChange,
  options,
  value,
}: PromptBarCompactSelectProps): ReactElement {
  return (
    <Select disabled={isDisabled} onValueChange={onChange} value={value}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          ghostSelectTriggerClassName,
          density === 'default' && 'h-9',
        )}
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
