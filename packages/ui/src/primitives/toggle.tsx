'use client';

import * as TogglePrimitive from '@radix-ui/react-toggle';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '../lib/utils';
import { toggleVariants } from './toggle.variants';

function Toggle({
  ref,
  className,
  variant,
  size,
  ...props
}: ComponentPropsWithRef<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      ref={ref}
      className={cn(toggleVariants({ className, size, variant }))}
      {...props}
    />
  );
}

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle };
