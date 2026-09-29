'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import {
  EMPTY_SELECT_ITEM_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement, ReactNode } from 'react';

/** Value used by every "no element picked" option — Radix rejects `''`. */
const NONE_VALUE = EMPTY_SELECT_ITEM_VALUE;

export function SettingRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="w-44 shrink-0">{children}</div>
    </div>
  );
}

export function OptionSelect({
  ariaLabel,
  isDisabled = false,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  isDisabled?: boolean;
  onChange: (value: string | undefined) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder: string;
  value: string | undefined;
}): ReactElement {
  return (
    <Select
      disabled={isDisabled}
      onValueChange={(next) => onChange(next === NONE_VALUE ? undefined : next)}
      value={value || NONE_VALUE}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('w-full', SHELL_CONTROL_HEIGHT_CLASS)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
