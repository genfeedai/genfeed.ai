'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppLayoutProps } from '@genfeedai/props/layout/app-layout.props';
import { Button } from '@ui/primitives/button';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
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
  isCollapsed: boolean;
  isResizing?: boolean;
  onResizeKeyDown?: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onResizeStart?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  shellChromeVariant?: AppLayoutProps['shellChromeVariant'];
  width?: number;
};

export default function DesktopSidebar({
  ariaLabel,
  children,
  collapsedWidth = SIDEBAR_COLLAPSED_WIDTH,
  isCollapsed,
  isResizing = false,
  onResizeKeyDown,
  onResizeStart,
  shellChromeVariant = 'default',
  width = SIDEBAR_DEFAULT_WIDTH,
}: DesktopSidebarProps) {
  const targetWidth = isCollapsed ? collapsedWidth : width;
  const canResize = Boolean(onResizeStart) && !isCollapsed;

  return (
    <aside
      aria-label={ariaLabel}
      data-testid="desktop-sidebar-rail"
      className={cn(
        'fixed bottom-0 left-0 z-30 hidden flex-col overflow-hidden md:flex',
        shellChromeVariant === 'transparent'
          ? 'bg-transparent'
          : 'bg-background',
        !isCollapsed &&
          shellChromeVariant !== 'transparent' &&
          'border-r border-border',
      )}
      style={{
        minWidth: targetWidth,
        top: 'var(--desktop-titlebar-height)',
        // Snap while dragging; ease only for collapse/expand.
        transition: isResizing
          ? 'none'
          : `width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, min-width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}`,
        width: targetWidth,
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
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize hover:bg-foreground/10"
          onKeyDown={onResizeKeyDown}
          onMouseDown={onResizeStart}
          role="separator"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        />
      ) : null}
    </aside>
  );
}
