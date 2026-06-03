'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppLayoutProps } from '@genfeedai/props/layout/app-layout.props';
import type { ReactNode } from 'react';

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 0;
const SIDEBAR_TRANSITION_DURATION_MS = 300;
const SIDEBAR_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

type DesktopSidebarProps = {
  children: ReactNode;
  collapsedWidth?: number;
  isCollapsed: boolean;
  shellChromeVariant?: AppLayoutProps['shellChromeVariant'];
  width?: number;
};

export default function DesktopSidebar({
  children,
  collapsedWidth = SIDEBAR_COLLAPSED_WIDTH,
  isCollapsed,
  shellChromeVariant = 'default',
  width = SIDEBAR_WIDTH,
}: DesktopSidebarProps) {
  const targetWidth = isCollapsed ? collapsedWidth : width;

  return (
    <aside
      data-testid="desktop-sidebar-rail"
      className={cn(
        'fixed bottom-0 left-0 z-30 hidden flex-col overflow-hidden md:flex',
        shellChromeVariant === 'transparent'
          ? 'bg-transparent'
          : 'bg-background-secondary',
        !isCollapsed &&
          shellChromeVariant !== 'transparent' &&
          'border-r border-border',
      )}
      style={{
        minWidth: targetWidth,
        top: 'var(--desktop-titlebar-height)',
        transition: `width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, min-width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}`,
        width: targetWidth,
      }}
    >
      {children}
    </aside>
  );
}
