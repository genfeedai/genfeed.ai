'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
  type ReactElement,
} from 'react';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = forwardRef<
  ComponentRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded bg-popover border border-border px-3 py-1.5 text-xs text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Convenience props for SimpleTooltip
 */
type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface SimpleTooltipProps {
  label: string;
  children: ReactElement;
  position?: TooltipPosition;
  isDisabled?: boolean;
}

/**
 * Simplified Tooltip component for common use cases
 * Wraps shadcn tooltip primitives with a convenient single-component API
 */
function SimpleTooltip({
  label,
  children,
  position = 'top',
  isDisabled = false,
}: SimpleTooltipProps) {
  if (isDisabled || !label) {
    return children;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={position}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export type { SimpleTooltipProps, TooltipPosition };
export {
  SimpleTooltip,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
};
