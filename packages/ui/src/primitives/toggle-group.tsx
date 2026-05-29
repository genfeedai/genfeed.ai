'use client';

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import type { VariantProps } from 'class-variance-authority';
import { type ComponentPropsWithRef, createContext, useContext } from 'react';
import { cn } from '../lib/utils';
import { toggleVariants } from './toggle.variants';

const ToggleGroupContext = createContext<VariantProps<typeof toggleVariants>>({
  size: 'default',
  variant: 'default',
});

function ToggleGroup({
  ref,
  className,
  variant,
  size,
  children,
  ...props
}: ComponentPropsWithRef<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={cn('flex items-center justify-center gap-1', className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ size, variant }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

function ToggleGroupItem({
  ref,
  className,
  children,
  variant,
  size,
  ...props
}: ComponentPropsWithRef<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        toggleVariants({
          size: context.size || size,
          variant: context.variant || variant,
        }),
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
