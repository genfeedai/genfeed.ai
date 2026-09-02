'use client';

import { cn } from '@genfeedai/helpers';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { ComponentPropsWithRef } from 'react';
import { overlayMenuSurfaceClassName } from './field-control';

const Popover: typeof PopoverPrimitive.Root = PopoverPrimitive.Root;

const PopoverTrigger: typeof PopoverPrimitive.Trigger =
  PopoverPrimitive.Trigger;

const PopoverAnchor: typeof PopoverPrimitive.Anchor = PopoverPrimitive.Anchor;

function PopoverContent({
  ref,
  className,
  align = 'center',
  sideOffset = 4,
  onPointerDownOutside,
  ...props
}: ComponentPropsWithRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        onPointerDownOutside={(event) => {
          const target = event.target as Element | null;
          if (target?.closest('[data-radix-popper-content-wrapper]')) {
            event.preventDefault();
          }
          onPointerDownOutside?.(event);
        }}
        className={cn(
          'app-region-no-drag z-50 w-72 rounded-md p-4 outline-none',
          overlayMenuSurfaceClassName,
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

function PopoverPanelContent({
  ref,
  className,
  align = 'start',
  sideOffset = 6,
  onPointerDownOutside,
  ...props
}: ComponentPropsWithRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        onPointerDownOutside={(event) => {
          const target = event.target as Element | null;
          if (target?.closest('[data-radix-popper-content-wrapper]')) {
            event.preventDefault();
          }
          onPointerDownOutside?.(event);
        }}
        className={cn(
          'app-region-no-drag z-[10001] overflow-hidden rounded-xl outline-none',
          overlayMenuSurfaceClassName,
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
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
