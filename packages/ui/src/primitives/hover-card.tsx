'use client';

import { cn } from '@genfeedai/helpers';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import type { ComponentPropsWithRef } from 'react';
import { overlayMenuSurfaceClassName } from './field-control';

const HoverCard: typeof HoverCardPrimitive.Root = HoverCardPrimitive.Root;

const HoverCardTrigger: typeof HoverCardPrimitive.Trigger =
  HoverCardPrimitive.Trigger;

function HoverCardContent({
  ref,
  align = 'start',
  className,
  side = 'right',
  sideOffset = 8,
  ...props
}: ComponentPropsWithRef<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        ref={ref}
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          'app-region-no-drag z-50 w-96 max-h-[32rem] overflow-y-auto rounded-xl p-3 outline-none',
          overlayMenuSurfaceClassName,
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardContent, HoverCardTrigger };
