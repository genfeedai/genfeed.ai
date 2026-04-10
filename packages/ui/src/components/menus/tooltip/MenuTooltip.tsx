'use client';

import type { TooltipPosition } from '@genfeedai/interfaces/ui/tooltip-position.interface';
import type {
  MenuTooltipProps,
  TooltipWrapperProps,
} from '@genfeedai/props/navigation/menu-tooltip.props';
import Portal from '@ui/layout/portal/Portal';
import type {
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
} from 'react';
import {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// Wrapper component that attaches event handlers to children
const TooltipWrapper = ({
  children,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onKeyDown,
  'aria-label': ariaLabel,
}: TooltipWrapperProps) => {
  // cloneElement doesn't accept ref in props - refs are handled separately
  // We don't need to forward refs here since triggerRef is set via event handlers
  return cloneElement(children, {
    'aria-label': ariaLabel,
    onBlur,
    onFocus,
    onKeyDown,
    onMouseEnter,
    onMouseLeave,
  } as Partial<Record<string, unknown>>);
};

export default function MenuTooltip({ label, children }: MenuTooltipProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback((reference?: HTMLElement) => {
    const element = reference ?? triggerRef.current;
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    setPosition({
      left: rect.right + 16, // Position from right edge of button with 16px spacing
      top: rect.top + rect.height / 2,
    });
  }, []);

  const handleHide = useCallback(() => {
    setIsVisible(false);
  }, []);

  const handleShow = useCallback(
    (event: FocusEvent<HTMLElement> | MouseEvent<HTMLElement>) => {
      triggerRef.current = event.currentTarget;
      updatePosition(event.currentTarget);
      setIsVisible(true);
    },
    [updatePosition],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') {
        handleHide();
      }
    },
    [handleHide],
  );

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const reposition = () => updatePosition();

    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isVisible, updatePosition]);

  const tooltipNode = useMemo(() => {
    if (!isVisible || !position) {
      return null;
    }

    return (
      <Portal>
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{
            left: position.left,
            top: position.top,
            transform: 'translateY(-50%)',
          }}
        >
          <div className=" bg-background text-xs text-foreground px-2 py-1 shadow-lg whitespace-nowrap">
            {label}
          </div>
        </div>
      </Portal>
    );
  }, [isVisible, position, label]);

  const callHandler = useCallback(
    <TEvent,>(handler: unknown, event: TEvent) => {
      if (typeof handler === 'function') {
        (handler as (event: TEvent) => void)(event);
      }
    },
    [],
  );

  const baseChild = children as ReactElement<Record<string, unknown>>;

  // Access props only once to avoid ref access during render
  const existingOnMouseEnter = baseChild.props?.onMouseEnter;
  const existingOnMouseLeave = baseChild.props?.onMouseLeave;
  const existingOnFocus = baseChild.props?.onFocus;
  const existingOnBlur = baseChild.props?.onBlur;
  const existingOnKeyDown = baseChild.props?.onKeyDown;
  const existingAriaLabel = baseChild.props?.['aria-label'];

  // Use wrapper component to properly handle refs without triggering React warnings
  const wrappedChild = useMemo(() => {
    return (
      <TooltipWrapper
        onMouseEnter={(event: MouseEvent<HTMLElement>) => {
          callHandler<MouseEvent<HTMLElement>>(existingOnMouseEnter, event);
          handleShow(event);
        }}
        onMouseLeave={(event: MouseEvent<HTMLElement>) => {
          callHandler<MouseEvent<HTMLElement>>(existingOnMouseLeave, event);
          handleHide();
        }}
        onFocus={(event: FocusEvent<HTMLElement>) => {
          callHandler<FocusEvent<HTMLElement>>(existingOnFocus, event);
          handleShow(event);
        }}
        onBlur={(event: FocusEvent<HTMLElement>) => {
          callHandler<FocusEvent<HTMLElement>>(existingOnBlur, event);
          handleHide();
        }}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          callHandler<KeyboardEvent<HTMLElement>>(existingOnKeyDown, event);
          handleKeyDown(event);
        }}
        aria-label={(existingAriaLabel as string | undefined) || label}
      >
        {baseChild}
      </TooltipWrapper>
    );
  }, [
    baseChild,
    callHandler,
    existingOnMouseEnter,
    existingOnMouseLeave,
    existingOnFocus,
    existingOnBlur,
    existingOnKeyDown,
    existingAriaLabel,
    handleHide,
    handleKeyDown,
    handleShow,
    label,
  ]);

  return (
    <>
      {wrappedChild}
      {tooltipNode}
    </>
  );
}
