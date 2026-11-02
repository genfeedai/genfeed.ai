'use client';

import { cn } from '@genfeedai/helpers/formatting/cn';
import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
} from 'react';

const HIGHLIGHT_DURATION_MS = 200;
/** Matches the sidebar's existing slide-in curve so every motion feels alike. */
const HIGHLIGHT_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** A highlight that went away longer ago than this is not "the previous row". */
const PREVIOUS_RECT_MAX_AGE_MS = 300;

/** The one fill shared by the active highlight and the row hover state. */
export const SIDEBAR_ROW_FILL_CLASS_NAME = 'bg-foreground/5';

interface HighlightMemory {
  /** The highlight currently on screen, if any. */
  element: HTMLElement | null;
  /** The highlight a newer one took over from, hidden until that one leaves. */
  hidden: HTMLElement | null;
  /** Where the last removed highlight sat, and when it left. */
  lastRect: { at: number; rect: DOMRect } | null;
}

const HighlightGroupContext =
  createContext<MutableRefObject<HighlightMemory> | null>(null);

interface SidebarHighlightGroupProps {
  readonly children: ReactNode;
}

/**
 * Scopes one sliding highlight to one sidebar. Wrap the whole navigation once;
 * a second sidebar (mobile drawer next to the desktop rail) gets its own
 * highlight instead of the two trading it.
 */
export function SidebarHighlightGroup({
  children,
}: SidebarHighlightGroupProps) {
  const memory = useRef<HighlightMemory>({
    element: null,
    hidden: null,
    lastRect: null,
  });

  return (
    <HighlightGroupContext.Provider value={memory}>
      {children}
    </HighlightGroupContext.Provider>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface SidebarActiveHighlightProps {
  readonly className?: string;
}

/**
 * The active-row background. Render it inside the active row (the row must be
 * `relative`, with its content in a `relative` wrapper so it sits above this).
 * When the active row changes, the new highlight glides in from where the old
 * one was instead of each row fading in and out on its own. Plain DOM
 * animation, so it adds nothing to the page's JavaScript; reduced-motion users
 * get the highlight without the slide.
 */
export function SidebarActiveHighlight({
  className,
}: SidebarActiveHighlightProps) {
  const memory = useContext(HighlightGroupContext);
  const elementRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = elementRef.current;

    if (!element || !memory) {
      return undefined;
    }

    const previous = memory.current.element;
    const lastRect = memory.current.lastRect;
    const fromRect =
      previous?.isConnected && previous !== element
        ? previous.getBoundingClientRect()
        : lastRect && performance.now() - lastRect.at < PREVIOUS_RECT_MAX_AGE_MS
          ? lastRect.rect
          : null;

    memory.current.element = element;
    memory.current.lastRect = null;

    if (previous && previous !== element) {
      // The old row keeps its highlight until its own render drops it; hide it
      // so only the gliding one shows.
      previous.style.visibility = 'hidden';
      memory.current.hidden = previous;
    }

    if (fromRect && typeof element.animate === 'function') {
      const toRect = element.getBoundingClientRect();
      const deltaX = fromRect.left - toRect.left;
      const deltaY = fromRect.top - toRect.top;

      if ((deltaX !== 0 || deltaY !== 0) && !prefersReducedMotion()) {
        element.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: 'translate(0, 0)' },
          ],
          { duration: HIGHLIGHT_DURATION_MS, easing: HIGHLIGHT_EASING },
        );
      }
    }

    return () => {
      if (memory.current.element === element) {
        const hidden = memory.current.hidden;
        memory.current.hidden = null;
        // A highlight that took over and is now gone (a navigation that never
        // landed) gives the previous one back.
        if (hidden?.isConnected) {
          hidden.style.visibility = '';
        }
        memory.current.element = hidden;
        memory.current.lastRect = {
          at: performance.now(),
          rect: element.getBoundingClientRect(),
        };
      }
    };
  }, [memory]);

  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit]',
        SIDEBAR_ROW_FILL_CLASS_NAME,
        className,
      )}
      data-sidebar-active-highlight=""
      ref={elementRef}
    />
  );
}
