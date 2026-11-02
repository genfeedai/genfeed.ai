'use client';

import { cn } from '@genfeedai/helpers/formatting/cn';
import { LayoutGroup, LazyMotion, m, MotionConfig } from 'motion/react';
import { type ReactNode, useId } from 'react';

/**
 * Layout animation is the heavy part of motion, so it loads after first paint.
 * Until it arrives the highlight renders in place without the slide.
 */
const loadHighlightFeatures = () =>
  import('./sidebar-highlight-features').then((module) => module.default);

const HIGHLIGHT_LAYOUT_ID = 'sidebar-active-highlight';

/** Matches the sidebar's existing slide-in curve so every motion feels alike. */
const HIGHLIGHT_TRANSITION = {
  duration: 0.2,
  ease: [0.32, 0.72, 0, 1],
} as const;

/** The one fill shared by the active highlight and the row hover state. */
export const SIDEBAR_ROW_FILL_CLASS_NAME = 'bg-foreground/5';

interface SidebarHighlightGroupProps {
  readonly children: ReactNode;
}

/**
 * Scopes one sliding highlight to one sidebar. Wrap the whole navigation once;
 * a second sidebar (mobile drawer next to the desktop rail) gets its own
 * highlight instead of the two trading it. Reduced-motion users get the
 * highlight without the slide.
 */
export function SidebarHighlightGroup({
  children,
}: SidebarHighlightGroupProps) {
  const groupId = useId();

  return (
    <LazyMotion features={loadHighlightFeatures}>
      <MotionConfig reducedMotion="user">
        <LayoutGroup id={groupId}>{children}</LayoutGroup>
      </MotionConfig>
    </LazyMotion>
  );
}

interface SidebarActiveHighlightProps {
  readonly className?: string;
}

/**
 * The active-row background. Render it inside the active row (the row must be
 * `relative`, with its content in a `relative` wrapper so it sits above this);
 * when the active row changes it glides from the old row to the new one instead
 * of fading out and in again.
 */
export function SidebarActiveHighlight({
  className,
}: SidebarActiveHighlightProps) {
  return (
    <m.span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit]',
        SIDEBAR_ROW_FILL_CLASS_NAME,
        className,
      )}
      data-sidebar-active-highlight=""
      layoutId={HIGHLIGHT_LAYOUT_ID}
      transition={HIGHLIGHT_TRANSITION}
    />
  );
}
