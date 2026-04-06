'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReactNode, SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: SelectOption[];
}

export default function Select({
  label,
  error,
  options,
  className,
  id,
  children,
  ...props
}: SelectProps) {
  const selectId = id || `select-${label?.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-foreground"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'w-full border border-input bg-background px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-destructive',
          className,
        )}
        {...props}
      >
        {options
          ? options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          : children}
      </select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
