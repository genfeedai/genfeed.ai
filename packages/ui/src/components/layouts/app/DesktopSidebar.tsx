'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_TRANSITION_DURATION_MS,
  SIDEBAR_TRANSITION_EASING,
} from './app-layout.utils';

const SIDEBAR_COLLAPSED_WIDTH = 0;

type DesktopSidebarProps = {
  ariaLabel?: string;
  children: ReactNode;
  collapsedWidth?: number;
  /**
   * In-flow column inside the rounded content block. Fixed positioning would
   * escape the block's overflow clip and sit on the window chrome instead.
   */
  embedded?: boolean;
  isCollapsed: boolean;
  isResizing?: boolean;
  onResizeKeyDown?: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /** Expanded width for aria-valuenow; visual width uses CSS var when expanded. */
  width?: number;
};

/**
 * Left nav rail. Expanded width is driven by `--desktop-sidebar-width` on the
 * layout root so drag can update the var without re-rendering MenuShared.
 *
 * Collapsing is a curtain: the rail's width animates, but its content keeps
 * the expanded width and is clipped, so labels never re-wrap mid-animation.
 * The content fades on the rail's own clock (see `app-layout.utils`).
 */
export default function DesktopSidebar({
  ariaLabel,
  children,
  collapsedWidth = SIDEBAR_COLLAPSED_WIDTH,
  embedded = false,
  isCollapsed,
  isResizing = false,
  onResizeKeyDown,
  onResizeStart,
  width = SIDEBAR_DEFAULT_WIDTH,
}: DesktopSidebarProps) {
  const canResize = Boolean(onResizeStart) && !isCollapsed;
  // Collapsed: fixed 0. Expanded: CSS var so drag only mutates the var.
  const widthStyle = isCollapsed
    ? collapsedWidth
    : 'var(--desktop-sidebar-width)';
  // The var flips to the collapsed width the instant the rail toggles, so the
  // content pins to the expanded `width` prop while collapsed and follows the
  // var (live while dragging) when open. Both read the same px at the switch.
  const contentWidth = isCollapsed ? width : 'var(--desktop-sidebar-width)';

  return (
    <aside
      aria-label={ariaLabel}
      // Page menu: the one surface exempt from the product motion policy.
      data-motion="allow"
      data-testid="desktop-sidebar-rail"
      className={cn(
        // One step off the page (gray-100 on pure black). The right edge is
        // the divider, painted inside the clip so it rides the curtain and is
        // gone at width 0 instead of popping out as a border would.
        'hidden flex-col overflow-hidden bg-gray-100 md:flex',
        'after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-10 after:w-px after:bg-border',
        embedded ? 'relative h-full min-h-0 shrink-0' : 'fixed bottom-0 z-30',
      )}
      style={{
        minWidth: widthStyle,
        transition: isResizing
          ? 'none'
          : `width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, min-width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}`,
        width: widthStyle,
        // Fixed only when the host has no rounded block to clip into.
        ...(embedded
          ? {}
          : {
              left: 'var(--desktop-rail-width, 0px)',
              top: 'calc(var(--desktop-titlebar-height) + var(--shell-inset, 0px) + var(--shell-edge, 0px))',
            }),
      }}
    >
      <div
        className="flex h-full min-h-0 shrink-0 flex-col"
        data-testid="desktop-sidebar-content"
        inert={isCollapsed}
        style={{
          opacity: isCollapsed ? 0 : 1,
          transition: isResizing
            ? 'none'
            : `opacity ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}`,
          width: contentWidth,
        }}
      >
        {children}
      </div>
      {canResize ? (
        <Button
          aria-orientation="vertical"
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuenow={width}
          ariaLabel="Resize navigation sidebar"
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize focus-visible:bg-primary/25 focus-visible:outline-none hover:bg-foreground/10"
          onKeyDown={onResizeKeyDown}
          onPointerDown={onResizeStart}
          role="separator"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        />
      ) : null}
    </aside>
  );
}
