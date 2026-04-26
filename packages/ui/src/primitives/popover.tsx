'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import {
  Popover as ShipPopover,
  PopoverAnchor as ShipPopoverAnchor,
  PopoverContent as ShipPopoverContent,
  PopoverTrigger as ShipPopoverTrigger,
} from '@shipshitdev/ui/primitives';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '../lib/utils';

const Popover = ShipPopover;

const PopoverTrigger = ShipPopoverTrigger;

const PopoverAnchor = ShipPopoverAnchor;

const PopoverContent = forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <ShipPopoverContent
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn('ship-ui w-72 p-4 text-primary', className)}
    {...props}
  />
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

const PopoverPanelContent = forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 6, ...props }, ref) => (
  <ShipPopoverContent
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn(
      'ship-ui z-[10001] overflow-hidden rounded-xl text-primary shadow-[0_28px_70px_-48px_rgba(0,0,0,0.92)]',
      className,
    )}
    {...props}
  />
));
PopoverPanelContent.displayName = 'PopoverPanelContent';

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverPanelContent,
  PopoverTrigger,
};
