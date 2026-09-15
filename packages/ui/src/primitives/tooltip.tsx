'use client';

import { cn } from '@genfeedai/helpers';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  type ComponentPropsWithRef,
  createContext,
  type ReactElement,
  useContext,
} from 'react';

const TooltipProviderContext = createContext(false);

function TooltipProvider({
  children,
  delayDuration = 200,
  ...props
}: ComponentPropsWithRef<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipProviderContext.Provider value={true}>
      <TooltipPrimitive.Provider delayDuration={delayDuration} {...props}>
        {children}
      </TooltipPrimitive.Provider>
    </TooltipProviderContext.Provider>
  );
}

const Tooltip: typeof TooltipPrimitive.Root = TooltipPrimitive.Root;

const TooltipTrigger: typeof TooltipPrimitive.Trigger =
  TooltipPrimitive.Trigger;

function TooltipContent({
  ref,
  className,
  sideOffset = 4,
  ...props
}: ComponentPropsWithRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          // Elevated surface + readable text. Avoid transparent / low-contrast
          // popovers that read as empty dark “pills” (same class of bug as the
          // collapsed switch chrome on publishing settings).
          'z-50 overflow-hidden rounded-md bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-dropdown',
          'origin-[var(--radix-tooltip-content-transform-origin)] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[state=instant-open]:animate-none motion-reduce:data-[state=delayed-open]:animate-none',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
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
  const hasSharedProvider = useContext(TooltipProviderContext);

  if (isDisabled || !label) {
    return children;
  }

  const tooltip = (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={position}>{label}</TooltipContent>
    </Tooltip>
  );

  return hasSharedProvider ? (
    tooltip
  ) : (
    <TooltipProvider>{tooltip}</TooltipProvider>
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
