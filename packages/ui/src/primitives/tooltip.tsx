'use client';

import { cn } from '@genfeedai/helpers';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  type ComponentPropsWithRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { SimpleTooltipProps, TooltipPosition } from './tooltip.types';
import { TooltipProviderContext } from './tooltip-context';

function TooltipProvider({
  children,
  delayDuration = 200,
  ...props
}: ComponentPropsWithRef<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipProviderContext.Provider value={SimpleTooltip}>
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

// Input modality, shared by every tooltip: was the last input a key press?
// One pair of capture listeners for the whole page, installed lazily.
let isKeyboardModality = false;
let isModalityTracked = false;

function trackInputModality(): void {
  if (isModalityTracked || typeof window === 'undefined') {
    return;
  }
  isModalityTracked = true;
  window.addEventListener(
    'keydown',
    () => {
      isKeyboardModality = true;
    },
    true,
  );
  window.addEventListener(
    'pointerdown',
    () => {
      isKeyboardModality = false;
    },
    true,
  );
}

/**
 * Simplified Tooltip component for common use cases
 * Wraps shadcn tooltip primitives with a convenient single-component API
 *
 * Opens only on a real hover or on keyboard focus. Focus a dialog hands back
 * to its trigger after a mouse-driven close (confirm, modal) does not open the
 * hint: the user just acted on that control and did not ask what it is.
 */
function SimpleTooltip({
  label,
  children,
  contentClassName,
  position = 'top',
  isDisabled = false,
}: SimpleTooltipProps) {
  const hasSharedProvider = useContext(TooltipProviderContext) !== null;
  const [isOpen, setIsOpen] = useState(false);
  const isHoveredRef = useRef(false);

  useEffect(() => {
    trackInputModality();
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen && !isHoveredRef.current && !isKeyboardModality) {
      return;
    }
    setIsOpen(nextOpen);
  }, []);

  if (isDisabled || !label) {
    return children;
  }

  const tooltip = (
    <Tooltip onOpenChange={handleOpenChange} open={isOpen}>
      <TooltipTrigger
        asChild
        onPointerDown={() => {
          // Acting on the control ends the hover that showed the hint; only a
          // fresh pointer move over it counts as hovering again.
          isHoveredRef.current = false;
          setIsOpen(false);
        }}
        onPointerLeave={() => {
          isHoveredRef.current = false;
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== 'touch') {
            isHoveredRef.current = true;
          }
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className={contentClassName} side={position}>
        {label}
      </TooltipContent>
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
