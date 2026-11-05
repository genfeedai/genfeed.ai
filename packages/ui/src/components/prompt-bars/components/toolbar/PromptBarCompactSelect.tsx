'use client';

import type { PromptBarCompactSelectProps } from '@genfeedai/props/prompt-bars/prompt-bar-send-button.props';
import { PROMPT_BAR_CHIP_SELECT_CLASS } from '@ui/constants/shell-chrome.constant';
import PromptBarChipIcon from '@ui/prompt-bars/components/toolbar/PromptBarChipIcon';
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
 * on the row (the Studio setup chips): 32px, a 14px icon, the 12px current
 * value. A `source` chip, the mode that decides what the bar makes, also
 * shows a small down chevron like the Studio type chip. Apps never style their
 * own dropdown on a prompt bar.
 */
export default function PromptBarCompactSelect({
  ariaLabel,
  icon,
  isDisabled = false,
  onChange,
  options,
  placeholder,
  value,
}: PromptBarCompactSelectProps): ReactElement {
  const selected = options.find((option) => option.value === value);
  const hasMatchingOption = selected !== undefined;

  return (
    <Select disabled={isDisabled} onValueChange={onChange} value={value}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={PROMPT_BAR_CHIP_SELECT_CLASS}
        hideIndicator
      >
        <PromptBarChipIcon kind={icon} value={selected?.label ?? value} />
        <SelectValue placeholder={placeholder}>
          {hasMatchingOption ? undefined : placeholder}
        </SelectValue>
        {icon === 'source' ? (
          <ChevronDown
            aria-hidden="true"
            className="size-3 shrink-0 text-muted-foreground"
          />
        ) : null}
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
