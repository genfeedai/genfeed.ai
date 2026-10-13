'use client';

import { cn } from '@genfeedai/helpers';
import {
  type FocusEvent,
  isValidElement,
  type ReactNode,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { findAnimatedIcon } from './animated-icon.registry';
import type {
  AnimatedIconHandle,
  HoverAnimatedIcon,
  UseHoverAnimatedIconOptions,
} from './animated-icon.types';

const SIZE_CLASS_PATTERN = /(?:^|\s)(?:size|w|h)-/;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Gives an icon that sits inside something interactive (a button, a nav row)
 * its animated twin, driven by the whole control rather than the glyph, so
 * pointing anywhere on the row moves the icon.
 *
 * Nothing changes until the first hover or keyboard focus: the static icon
 * renders on the server and on first paint, and only then is the animated one
 * loaded and swapped in, with the static icon as the Suspense fallback.
 * Icons without an animated twin, and reduced-motion users, are untouched.
 *
 * Spread `hoverProps` onto the interactive element (composing its own
 * handlers) and render `icon` where the icon goes.
 */
export function useHoverAnimatedIcon(
  icon: ReactNode,
  { defaultSizeClassName }: UseHoverAnimatedIconOptions = {},
): HoverAnimatedIcon {
  const iconType = isValidElement(icon) ? icon.type : undefined;
  const Animated = iconType ? findAnimatedIcon(iconType) : undefined;
  const [isArmed, setIsArmed] = useState(false);
  const handleRef = useRef<AnimatedIconHandle | null>(null);
  const isActiveRef = useRef(false);

  // The animated icon mounts after the hover that armed it, so a handle that
  // arrives while the pointer is still over the control starts straight away.
  const attachHandle = useCallback((handle: AnimatedIconHandle | null) => {
    handleRef.current = handle;
    if (handle && isActiveRef.current) {
      handle.startAnimation();
    }
  }, []);

  const start = useCallback(() => {
    isActiveRef.current = true;
    if (!Animated || prefersReducedMotion()) {
      return;
    }
    setIsArmed(true);
    handleRef.current?.startAnimation();
  }, [Animated]);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    handleRef.current?.stopAnimation();
  }, []);

  const hoverProps = useMemo(
    () => ({
      onBlur: stop,
      // Pointer focus is not a reason to animate; keyboard focus is.
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (event.currentTarget.matches(':focus-visible')) {
          start();
        }
      },
      onMouseEnter: start,
      onMouseLeave: stop,
    }),
    [start, stop],
  );

  const isAnimatable = Boolean(Animated);

  if (!Animated || !isArmed || !isValidElement<{ className?: string }>(icon)) {
    return { hoverProps, icon, isAnimatable, start, stop };
  }

  const { className } = icon.props;

  return {
    hoverProps,
    isAnimatable,
    start,
    stop,
    icon: (
      <Suspense fallback={icon}>
        <Animated
          aria-hidden="true"
          className={
            className && SIZE_CLASS_PATTERN.test(className)
              ? className
              : cn(className, defaultSizeClassName ?? 'size-6')
          }
          ref={attachHandle}
        />
      </Suspense>
    ),
  };
}
