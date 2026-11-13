'use client';

import { cn } from '@genfeedai/helpers';
import { prefersReducedMotion } from '@genfeedai/helpers/ui/prefers-reduced-motion.helper';
import {
  type FocusEvent,
  isValidElement,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  findAnimatedIcon,
  preloadAnimatedIcon,
} from './animated-icon.registry';
import type {
  AnimatedIconHandle,
  HoverAnimatedIcon,
  UseHoverAnimatedIconOptions,
} from './animated-icon.types';

const PRELOAD_DELAY_MS = 2_000;
const SIZE_CLASS_PATTERN = /(?:^|\s)(?:size|w|h)-/;

// Waits out the first seconds after the control mounts, when the router is
// still fetching the page's destinations, then runs when the browser is idle.
function whenIdle(callback: () => void): () => void {
  let cancelIdle: (() => void) | undefined;
  const timeout = window.setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(callback, { timeout: 3_000 });
      cancelIdle = () => window.cancelIdleCallback(handle);
      return;
    }
    callback();
  }, PRELOAD_DELAY_MS);

  return () => {
    window.clearTimeout(timeout);
    cancelIdle?.();
  };
}

/**
 * Gives an icon that sits inside something interactive (a button, a nav row)
 * its animated twin, driven by the whole control rather than the glyph, so
 * pointing anywhere on the row moves the icon.
 *
 * Nothing changes until the first hover or keyboard focus: the static icon
 * renders on the server and on first paint, and only then is the animated one
 * swapped in, with the static icon as the Suspense fallback. The twin's code
 * loads once the browser is idle, ahead of any hover, so pointing at a control
 * and clicking it right away does not wait on a script fetch.
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

  useEffect(() => {
    if (!iconType || !Animated || prefersReducedMotion()) {
      return;
    }
    return whenIdle(() => {
      void preloadAnimatedIcon(iconType);
    });
  }, [Animated, iconType]);

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
