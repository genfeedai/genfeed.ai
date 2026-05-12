'use client';

import * as SeparatorPrimitive from '@radix-ui/react-separator';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '../lib/utils';

function Separator({
  ref,
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: ComponentPropsWithRef<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className,
      )}
      {...props}
    />
  );
}
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
