'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import type { DropdownBaseProps } from '@props/components/dropdown-base.props';
import Button from '@ui/buttons/base/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

import { createPortal } from 'react-dom';

/**
 * Base dropdown component with two rendering modes:
 *
 * 1. position="auto" (default) — uses Radix DropdownMenu with full
 *    accessibility, keyboard nav, and auto-positioning.
 *
 * 2. position="bottom-full" | "top-full" — uses createPortal with manual
 *    getBoundingClientRect positioning (same approach as QuickActionsMenu
 *    and DropdownPrompt). Required inside masonry cards where CSS transforms
 *    interfere with Radix's floating-ui collision detection.
 */
export default function DropdownBase({
  trigger,
  children,
  className = '',
  isOpen: controlledIsOpen,
  onOpenChange,
  minWidth = '160px',
  maxWidth,
  position = 'auto',
}: DropdownBaseProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const setTriggerElement = useCallback((node: HTMLElement | null) => {
    triggerRef.current = node;
  }, []);

  const isOpen = controlledIsOpen ?? internalIsOpen;
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setInternalIsOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  const useManualPortal = position === 'bottom-full' || position === 'top-full';

  // ---------- Manual portal positioning ----------
  const [portalPos, setPortalPos] = useState({
    left: 0,
    right: 0,
    top: 0,
    useRight: false,
  });

  const updatePortalPosition = useCallback(() => {
    if (!triggerRef.current) {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;
    const viewportWidth = window.innerWidth;
    const minW = parseInt(minWidth, 10) || 160;
    const wouldOverflowRight = rect.left + minW > viewportWidth;

    setPortalPos({
      left: rect.left + scrollX,
      right: viewportWidth - (rect.right + scrollX),
      top:
        position === 'bottom-full'
          ? rect.top + scrollY - 8
          : rect.bottom + scrollY + 8,
      useRight: wouldOverflowRight,
    });
  }, [position, minWidth]);

  useIsomorphicLayoutEffect(() => {
    if (!useManualPortal || !isOpen) {
      return;
    }

    updatePortalPosition();
  }, [isOpen, useManualPortal, updatePortalPosition]);

  // Click-outside handler for manual portal mode
  useEffect(() => {
    if (!useManualPortal || !isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        handleOpenChange(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleOpenChange(false);
      }
    };

    updatePortalPosition();
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePortalPosition);
    window.addEventListener('scroll', updatePortalPosition, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePortalPosition);
      window.removeEventListener('scroll', updatePortalPosition, true);
    };
  }, [isOpen, useManualPortal, handleOpenChange, updatePortalPosition]);

  const renderTrigger = useCallback(
    (manual: boolean) => {
      const baseClassName = cn('cursor-pointer', className);
      const manualHandlers = manual
        ? {
            onClick: (event: ReactMouseEvent<HTMLElement>) => {
              event.stopPropagation();
              handleOpenChange(!isOpen);
            },
            onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleOpenChange(!isOpen);
              }

              if (event.key === 'Escape') {
                handleOpenChange(false);
              }
            },
            ref: setTriggerElement,
          }
        : {};

      if (isValidElement(trigger)) {
        const triggerElement = trigger as ReactElement<Record<string, unknown>>;
        const triggerProps = triggerElement.props as Record<string, unknown> & {
          className?: string;
          onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
          onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
        };

        return cloneElement(triggerElement, {
          ...manualHandlers,
          'aria-expanded': isOpen,
          className: cn(triggerProps.className, baseClassName),
          onClick: manual
            ? (event: ReactMouseEvent<HTMLElement>) => {
                triggerProps.onClick?.(event);
                if (!event.defaultPrevented) {
                  manualHandlers.onClick?.(event);
                }
              }
            : triggerProps.onClick,
          onKeyDown: manual
            ? (event: ReactKeyboardEvent<HTMLElement>) => {
                triggerProps.onKeyDown?.(event);
                if (!event.defaultPrevented) {
                  manualHandlers.onKeyDown?.(event);
                }
              }
            : triggerProps.onKeyDown,
        });
      }

      return (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          {...manualHandlers}
          aria-expanded={isOpen}
          className={baseClassName}
        >
          {trigger}
        </Button>
      );
    },
    [className, handleOpenChange, isOpen, setTriggerElement, trigger],
  );

  // ---------- Radix mode (position="auto") ----------
  if (!useManualPortal) {
    return (
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          {renderTrigger(false)}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="bottom"
          align="end"
          sideOffset={8}
          className="p-1.5"
          style={{
            minWidth,
            ...(maxWidth && { maxWidth }),
          }}
        >
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // ---------- Manual portal mode (bottom-full / top-full) ----------
  const renderPortalDropdown = () => {
    if (!isOpen || typeof window === 'undefined') {
      return null;
    }

    return createPortal(
      <div
        ref={dropdownRef}
        data-dropdown="true"
        data-quick-actions-dropdown="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: `${portalPos.top}px`,
          ...(portalPos.useRight
            ? { right: `${portalPos.right}px` }
            : { left: `${portalPos.left}px` }),
          minWidth,
          transform: position === 'bottom-full' ? 'translateY(-100%)' : 'none',
          zIndex: 10001,
          ...(maxWidth && { maxWidth }),
        }}
        className={cn(
          BG_BLUR,
          BORDER_WHITE_30,
          'overflow-hidden p-1.5 text-card-foreground',
          'animate-in fade-in-0 zoom-in-95',
          position === 'bottom-full'
            ? 'slide-in-from-bottom-2'
            : 'slide-in-from-top-2',
        )}
      >
        {children}
      </div>,
      document.body,
    );
  };

  return (
    <div className="relative">
      {renderTrigger(true)}
      {renderPortalDropdown()}
    </div>
  );
}
