'use client';

import type { ReactNode } from 'react';

type DesktopRailProps = {
  children: ReactNode;
};

/**
 * Fixed app rail at the far left. It never collapses: the sidebar to its right
 * offsets itself by `--desktop-rail-width` and collapses independently.
 */
export default function DesktopRail({ children }: DesktopRailProps) {
  return (
    <aside
      aria-label="App navigation"
      data-testid="desktop-app-rail"
      className="fixed bottom-0 left-0 z-30 hidden w-[var(--desktop-rail-width)] flex-col border-r border-border bg-background md:flex"
      style={{ top: 'var(--desktop-titlebar-height)' }}
    >
      {children}
    </aside>
  );
}
