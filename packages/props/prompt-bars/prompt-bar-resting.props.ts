import type { RefObject } from 'react';

/** Scroll gesture bookkeeping for the resting (one-line) prompt bar. */
export interface PromptBarRestingGestureState {
  accumulatedPx: number;
  lastEventAt: number;
  lastScrollTop: number;
}

export interface PromptBarRestingScrollSample {
  isAtEnd: boolean;
  now: number;
  scrollTop: number;
}

export interface UsePromptBarRestingOptions {
  /** The composer surface; focus or a pointer press inside it opens the bar. */
  composerRef: RefObject<HTMLElement | null>;
  /** False keeps the bar open, e.g. while a banner or an error is showing. */
  isEnabled?: boolean;
  /** The page's own scroller (transcript or gallery) the bar floats over. */
  scrollRef: RefObject<HTMLElement | null>;
}

export interface UsePromptBarRestingReturn {
  expand: () => void;
  isResting: boolean;
}
