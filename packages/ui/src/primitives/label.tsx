'use client';

import { Label as ShipLabel } from '@shipshitdev/ui/primitives';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '../lib/utils';

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
);

export type LabelProps = ComponentPropsWithRef<'label'> &
  VariantProps<typeof labelVariants>;

function Label({ ref, className, ...props }: LabelProps) {
  return (
    <ShipLabel
      ref={ref}
      className={cn('ship-ui', labelVariants(), className)}
      {...props}
    />
  );
}
Label.displayName = 'Label';

export { Label };
