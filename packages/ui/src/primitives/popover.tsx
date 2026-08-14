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
import { overlayMenuSurfaceClassName } from './field-control';

const Popover: typeof ShipPopover = ShipPopover;

const PopoverTrigger: typeof ShipPopoverTrigger = ShipPopoverTrigger;

const PopoverAnchor: typeof ShipPopoverAnchor = ShipPopoverAnchor;

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
      className={cn('ship-ui w-72 p-4', overlayMenuSurfaceClassName, className)}
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
        'ship-ui z-[10001] overflow-hidden rounded-xl',
        overlayMenuSurfaceClassName,
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
