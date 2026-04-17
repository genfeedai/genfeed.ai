'use client';

import { ButtonVariant } from '@genfeedai/enums';
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface DropdownProps {
  children: ReactNode;
  className?: string;
  isOpen?: boolean;
  maxWidth?: string;
  minWidth?: string;
  onOpenChange?: (open: boolean) => void;
  position?: 'bottom-full' | 'top-full' | 'auto';
  trigger: ReactNode;
  usePortal?: boolean;
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function Dropdown({
  children,
  className = '',
  isOpen: controlledIsOpen,
  maxWidth,
  minWidth = '160px',
  onOpenChange,
  position = 'auto',
  trigger,
  usePortal = false,
}: DropdownProps) {
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

  const useManualPortal =
    usePortal || position === 'bottom-full' || position === 'top-full';

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
  }, [minWidth, position]);

  useIsomorphicLayoutEffect(() => {
    if (!useManualPortal || !isOpen) {
      return;
    }

    updatePortalPosition();
  }, [isOpen, updatePortalPosition, useManualPortal]);

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
  }, [handleOpenChange, isOpen, updatePortalPosition, useManualPortal]);

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
          aria-expanded={isOpen}
          className={baseClassName}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          {...manualHandlers}
        >
          {trigger}
        </Button>
      );
    },
    [className, handleOpenChange, isOpen, setTriggerElement, trigger],
  );

  if (!useManualPortal) {
    return (
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          {renderTrigger(false)}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="p-1.5"
          side="bottom"
          sideOffset={8}
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

  const renderPortalDropdown = () => {
    if (!isOpen || typeof window === 'undefined') {
      return null;
    }

    return createPortal(
      <div
        ref={dropdownRef}
        data-dropdown="true"
        data-quick-actions-dropdown="true"
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
      >
        <div className="overflow-hidden rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-md">
          {children}
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <>
      {renderTrigger(true)}
      {renderPortalDropdown()}
    </>
  );
}
