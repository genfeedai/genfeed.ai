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
} from './app-layout.utils';

const SIDEBAR_COLLAPSED_WIDTH = 0;
const SIDEBAR_TRANSITION_DURATION_MS = 300;
const SIDEBAR_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

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

  return (
    <aside
      aria-label={ariaLabel}
      data-testid="desktop-sidebar-rail"
      className={cn(
        // One step off the page (gray-100 on pure black). The right border is
        // the divider. Omitted while collapsed so a 1px line does not survive
        // at width 0.
        'hidden flex-col overflow-hidden bg-gray-100 md:flex',
        embedded ? 'relative h-full min-h-0 shrink-0' : 'fixed bottom-0 z-30',
        !isCollapsed && 'border-r border-border',
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
      {children}
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
