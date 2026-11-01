'use client';

import { cn } from '@genfeedai/helpers';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithRef } from 'react';
import {
  progressIndicatorVariants,
  progressVariants,
} from './progress.variants';

export interface ProgressProps
  extends ComponentPropsWithRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof progressVariants> {
  isIndeterminate?: boolean;
}

function Progress({
  ref,
  className,
  value,
  size,
  tone,
  isIndeterminate = false,
  ...props
}: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={isIndeterminate ? undefined : value}
      className={cn(progressVariants({ size, tone }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          progressIndicatorVariants({ tone }),
          isIndeterminate ? 'w-1/3 motion-safe:animate-pulse' : 'w-full',
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
