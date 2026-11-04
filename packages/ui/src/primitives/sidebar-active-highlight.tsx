'use client';

import { cn } from '@genfeedai/helpers/formatting/cn';
import { prefersReducedMotion } from '@genfeedai/helpers/ui/prefers-reduced-motion.helper';
import { useLinkStatus } from 'next/link';
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
/** The hover fill of a row that is not active; same token as the highlight. */
export const SIDEBAR_ROW_HOVER_FILL_CLASS_NAME = 'hover:bg-foreground/5';

interface HighlightMemory {
  /** The highlight currently on screen, if any. */
  element: HTMLElement | null;
  /** Highlights a newer one took over from, hidden until the newer one leaves. */
  hidden: Set<HTMLElement>;
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
    hidden: new Set(),
    lastRect: null,
  });

  return (
    <HighlightGroupContext.Provider value={memory}>
      {children}
    </HighlightGroupContext.Provider>
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

    const state = memory.current;
    const previous = state.element;
    const lastRect = state.lastRect;
    const fromRect =
      previous?.isConnected && previous !== element
        ? previous.getBoundingClientRect()
        : lastRect && performance.now() - lastRect.at < PREVIOUS_RECT_MAX_AGE_MS
          ? lastRect.rect
          : null;

    state.element = element;
    state.lastRect = null;

    if (previous && previous !== element) {
      // The old row keeps its highlight until its own render drops it; hide it
      // so only the gliding one shows. display, not visibility: the global
      // reduced-motion rule gives every element a 0.01ms transition, and a
      // visibility change would linger for a frame under it.
      previous.style.display = 'none';
      state.hidden.add(previous);
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
      state.hidden.delete(element);

      if (state.element !== element) {
        return;
      }

      // Remember where it left off (mid-glide included) so the highlight that
      // replaces it in this same commit continues from there instead of
      // jumping back to the row it first took over from.
      state.element = null;
      state.lastRect = {
        at: performance.now(),
        rect: element.getBoundingClientRect(),
      };

      // A highlight that took over and is now gone with nothing replacing it
      // (a navigation that never landed) gives the previous one back. Checked
      // after the commit, once the DOM shows whether that row is still there.
      queueMicrotask(() => {
        if (state.element) {
          return;
        }

        for (const hidden of state.hidden) {
          if (hidden.isConnected) {
            hidden.style.display = '';
          }
        }
        state.hidden.clear();
      });
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

/**
 * Lives inside a row's Link: while that link's navigation is in flight the
 * highlight already moves here, so the row answers the click instead of
 * waiting for the next route to load.
 */
export function SidebarPendingHighlight() {
  const { pending } = useLinkStatus();

  return pending ? <SidebarActiveHighlight /> : null;
}

interface SidebarRowHighlightProps {
  readonly isActive: boolean;
}

/**
 * The one highlight every navigation row uses, in the sidebar menu and in the
 * app rail alike: the sliding fill on the active row, and the pending fill on
 * a row whose link is being followed. Render it inside the row's Link.
 */
export function SidebarRowHighlight({ isActive }: SidebarRowHighlightProps) {
  return isActive ? <SidebarActiveHighlight /> : <SidebarPendingHighlight />;
}

/**
 * Text and hover state of a navigation row. The active fill is the sliding
 * highlight, never a class, so only the hover fill appears here.
 */
export function sidebarRowStateClassName(
  isActive: boolean,
  inactiveClassName = 'text-foreground/80',
): string {
  return isActive
    ? 'text-foreground'
    : cn(
        inactiveClassName,
        SIDEBAR_ROW_HOVER_FILL_CLASS_NAME,
        'hover:text-foreground',
      );
}
