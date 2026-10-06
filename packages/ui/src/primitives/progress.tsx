'use client';

import { cn } from '@genfeedai/helpers';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import type { ComponentPropsWithRef } from 'react';

export interface ProgressProps
  extends ComponentPropsWithRef<typeof ProgressPrimitive.Root> {
  isIndeterminate?: boolean;
}

function Progress({
  ref,
  className,
  value,
  isIndeterminate = false,
  ...props
}: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={isIndeterminate ? undefined : value}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          'size-full flex-1 bg-primary transition-transform duration-300 ease-out',
          isIndeterminate && 'w-1/3 animate-pulse',
        )}
        style={
          isIndeterminate
            ? undefined
            : { transform: `translateX(-${100 - (value || 0)}%)` }
        }
      />
    </ProgressPrimitive.Root>
  );
}
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
