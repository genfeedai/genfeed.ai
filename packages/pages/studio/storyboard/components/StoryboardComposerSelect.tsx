'use client';

import type { StoryboardComposerSelectProps } from '@genfeedai/props/studio/storyboard.props';
import { ghostSelectTriggerClassName } from '@ui/primitives/field-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement } from 'react';

/** Compact ghost dropdown for the prompt-bar toolbar, like Studio's controls. */
export default function StoryboardComposerSelect({
  ariaLabel,
  isDisabled = false,
  onChange,
  options,
  value,
}: StoryboardComposerSelectProps): ReactElement {
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
