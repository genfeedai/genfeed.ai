'use client';

import { cn } from '@helpers/formatting/cn/cn.util';

export interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Reusable toggle switch component
 * Extracted from repeated inline toggle patterns across node components
 */
export default function Toggle({
  checked,
  onChange,
  disabled = false,
  size = 'sm',
  className,
}: ToggleProps): React.JSX.Element {
  const sizeClasses = {
    md: {
      knob: 'h-6 w-6',
      track: 'h-8 w-14',
      translateActive: 'translate-x-7',
      translateInactive: 'translate-x-1',
    },
    sm: {
      knob: 'h-3 w-3',
      track: 'h-5 w-9',
      translateActive: 'translate-x-5',
      translateInactive: 'translate-x-1',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={cn(
        'relative inline-flex items-center rounded-full transition-colors',
        sizes.track,
        checked ? 'bg-primary' : 'bg-muted',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block transform rounded-full bg-white transition-transform shadow-sm',
          sizes.knob,
          checked ? sizes.translateActive : sizes.translateInactive,
        )}
      />
    </button>
  );
}
