import { cn } from '@helpers/formatting/cn/cn.util';
import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export default function Select({
  label,
  className,
  id,
  children,
  ...props
}: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'flex h-9 w-full border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
