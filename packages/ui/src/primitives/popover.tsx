'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import {
  Popover as ShipPopover,
  PopoverAnchor as ShipPopoverAnchor,
  PopoverContent as ShipPopoverContent,
  PopoverTrigger as ShipPopoverTrigger,
} from '@shipshitdev/ui/primitives';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '../lib/utils';

const Popover = ShipPopover;

const PopoverTrigger = ShipPopoverTrigger;

const PopoverAnchor = ShipPopoverAnchor;

function PopoverContent({
  ref,
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: ComponentPropsWithRef<typeof PopoverPrimitive.Content>) {
  return (
    <ShipPopoverContent
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn('ship-ui w-72 p-4 text-primary', className)}
      {...props}
    />
  );
}
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

function PopoverPanelContent({
  ref,
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: ComponentPropsWithRef<typeof PopoverPrimitive.Content>) {
  return (
    <ShipPopoverContent
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'ship-ui z-[10001] overflow-hidden rounded-xl text-primary shadow-dropdown',
        className,
      )}
      {...props}
    />
  );
}
PopoverPanelContent.displayName = 'PopoverPanelContent';

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverPanelContent,
  PopoverTrigger,
};
