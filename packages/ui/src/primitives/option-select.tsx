'use client';

import { cn } from '@genfeedai/helpers';
import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectNoMatch,
  SelectOptions,
  SelectSearch,
  SelectTrigger,
  SelectValue,
} from './select';

export interface OptionSelectOption {
  /** Accessible name for an option that has no text. */
  ariaLabel?: string;
  /** A platform logo, an account avatar, a brand mark: shown in the list and in the closed control. */
  icon?: ReactNode;
  /** Heading the option is listed under; options with the same heading sit together, in order of first appearance. */
  group?: string;
  isDisabled?: boolean;
  /** Plain text: it is what the search matches and what the closed control shows. */
  label: string;
  /** Keeps what a person typed (handles, names) exactly as written. */
  isLiteral?: boolean;
  value: string;
}

export interface OptionSelectProps {
  ariaLabel: string;
  /** Layout only: width, margin. */
  className?: string;
  /** What the control is about (a clock for a duration). Shown in the closed control when the chosen option has no icon of its own. */
  icon?: ReactNode;
  /** Closed control shows the icon alone; the name stays on the control for screen readers. */
  isIconOnly?: boolean;
  /** Drop the chevron when the control is itself styled as a badge. */
  isIndicatorHidden?: boolean;
  isDisabled?: boolean;
  /** `true` always, `false` never; by default a list longer than a glance. */
  isSearchable?: boolean;
  noMatchLabel?: string;
  onValueChange: (value: string) => void;
  options: readonly OptionSelectOption[];
  placeholder?: string;
  searchLabel?: string;
  testId?: string;
  value: string;
}

function groupOptions(options: readonly OptionSelectOption[]) {
  const groups = new Map<string | undefined, OptionSelectOption[]>();
  for (const option of options) {
    const members = groups.get(option.group);
    if (members) {
      members.push(option);
    } else {
      groups.set(option.group, [option]);
    }
  }
  return [...groups];
}

/** A search box earns its place once a list is longer than a glance. */
const SEARCH_THRESHOLD = 8;

/**
 * The one control for choosing a single value from a list: a `Select` whose
 * options carry an icon, shown in the list and in the closed control, with a
 * search field once the list is long. Use it instead of a row of buttons or a
 * hand-built dropdown.
 */
export function OptionSelect({
  ariaLabel,
  className,
  icon,
  isDisabled,
  isIconOnly = false,
  isIndicatorHidden = false,
  isSearchable,
  noMatchLabel = 'No matches',
  onValueChange,
  options,
  placeholder,
  searchLabel,
  testId,
  value,
}: OptionSelectProps) {
  // The list mounts when it opens, so the closed control draws the icon itself.
  const chosen = options.find((option) => option.value === value);
  const hasSearch = isSearchable ?? options.length > SEARCH_THRESHOLD;
  const leadingIcon = chosen?.icon ?? icon;

  return (
    <Select disabled={isDisabled} onValueChange={onValueChange} value={value}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('w-auto', className)}
        data-testid={testId}
        hideIndicator={isIconOnly || isIndicatorHidden}
      >
        <span className="flex min-w-0 items-center gap-2">
          {leadingIcon ? (
            <span className="flex shrink-0 items-center">{leadingIcon}</span>
          ) : null}
          {isIconOnly ? null : <SelectValue placeholder={placeholder} />}
        </span>
      </SelectTrigger>
      <SelectContent>
        {hasSearch ? (
          <>
            <SelectSearch
              aria-label={searchLabel ?? ariaLabel}
              placeholder={searchLabel}
            />
            <SelectNoMatch>{noMatchLabel}</SelectNoMatch>
          </>
        ) : null}
        <SelectOptions>
          {groupOptions(options).map(([heading, members]) => {
            const items = members.map((option) => (
              <SelectItem
                aria-label={option.ariaLabel}
                className={option.isLiteral ? 'normal-case' : undefined}
                disabled={option.isDisabled}
                icon={option.icon}
                key={option.value}
                label={option.label}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ));

            return heading === undefined ? (
              items
            ) : (
              <SelectGroup key={heading}>
                <SelectLabel>{heading}</SelectLabel>
                {items}
              </SelectGroup>
            );
          })}
        </SelectOptions>
      </SelectContent>
    </Select>
  );
}
