'use client';

import type { StoryboardSelectProps } from '@genfeedai/props/studio/storyboard.props';
import {
  EMPTY_SELECT_ITEM_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement } from 'react';

/** Option select whose placeholder item clears the value (Radix rejects `''`). */
export default function StoryboardSelect({
  ariaLabel,
  isDisabled = false,
  onChange,
  options,
  placeholder,
  value,
}: StoryboardSelectProps): ReactElement {
  return (
    <Select
      disabled={isDisabled}
      onValueChange={(next) =>
        onChange(next === EMPTY_SELECT_ITEM_VALUE ? undefined : next)
      }
      value={value || EMPTY_SELECT_ITEM_VALUE}
    >
      <SelectTrigger aria-label={ariaLabel} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_SELECT_ITEM_VALUE}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.isDisabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
