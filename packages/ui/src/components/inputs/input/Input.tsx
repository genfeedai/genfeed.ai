import { cn } from '@helpers/formatting/cn/cn.util';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function Input({ label, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'flex h-9 w-full border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className,
        )}
        {...props}
      />
    </div>
  );
}
