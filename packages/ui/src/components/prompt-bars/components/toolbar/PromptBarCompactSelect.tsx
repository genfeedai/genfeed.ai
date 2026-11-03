'use client';

import type { PromptBarCompactSelectProps } from '@genfeedai/props/prompt-bars/prompt-bar-send-button.props';
import { PROMPT_BAR_CHIP_SELECT_CLASS } from '@ui/constants/shell-chrome.constant';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ChevronDown } from 'lucide-react';
import type { ReactElement } from 'react';

/**
 * The one dropdown chip for prompt-bar toolbars. Same box as every other chip
 * on the row (the Agent mode and Studio type chips): 32px, 12px label, a small
 * down chevron. Apps never style their own dropdown on a prompt bar.
 */
export default function PromptBarCompactSelect({
  ariaLabel,
  isDisabled = false,
  onChange,
  options,
  placeholder,
  value,
}: PromptBarCompactSelectProps): ReactElement {
  return (
    <Select disabled={isDisabled} onValueChange={onChange} value={value}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={PROMPT_BAR_CHIP_SELECT_CLASS}
        hideIndicator
      >
        <SelectValue placeholder={placeholder} />
        <ChevronDown
          aria-hidden="true"
          className="size-3 shrink-0 text-muted-foreground"
        />
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
