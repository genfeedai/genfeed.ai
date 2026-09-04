'use client';

import { cn } from '@genfeedai/helpers';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import type { ComponentPropsWithRef } from 'react';

function Progress({
  ref,
  className,
  value,
  ...props
}: ComponentPropsWithRef<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="size-full flex-1 bg-primary transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
