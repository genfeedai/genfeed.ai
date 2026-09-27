'use client';

import type { ReactNode } from 'react';

type DesktopRailProps = {
  children: ReactNode;
};

/**
 * Fixed app rail at the far left. It never collapses: the sidebar to its right
 * offsets itself by `--desktop-rail-width` and collapses independently. Rail
 * and sidebar share one chrome surface with no divider; the inset content
 * panel carries the border.
 */
export default function DesktopRail({ children }: DesktopRailProps) {
  return (
    <aside
      aria-label="App navigation"
      data-testid="desktop-app-rail"
      className="fixed bottom-0 left-0 z-30 hidden w-[var(--desktop-rail-width)] flex-col bg-gray-100 md:flex"
      // Same top inset as the content surface, so the rail's first row, the
      // sidebar header and the topbar share one 48px band; flush at the bottom.
      style={{
        top: 'calc(var(--desktop-titlebar-height) + var(--shell-inset, 0px) + var(--shell-edge, 0px))',
      }}
    >
      {children}
    </aside>
  );
}
