'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

type DesktopRailProps = {
  children: ReactNode;
};

/**
 * Fixed app rail at the far left. It never collapses: the sidebar to its right
 * offsets itself by `--desktop-rail-width` and collapses independently. The
 * rail is one tone off the sidebar plane behind it (a foreground wash, so it
 * steps the same way in light and dark) with no divider of its own. The menu
 * sidebar's right border separates that chrome from the page.
 */
export default function DesktopRail({ children }: DesktopRailProps) {
  const translate = useTranslations('common.appRail');

  return (
    <aside
      aria-label={translate('navigation')}
      data-testid="desktop-app-rail"
      className="fixed bottom-0 left-0 z-30 hidden w-[var(--desktop-rail-width)] flex-col bg-foreground/[0.04] md:flex"
      // Same top as the topbar row, so the rail's first row, the sidebar
      // header and the topbar share one 48px band; flush at the bottom.
      style={{
        top: 'calc(var(--desktop-titlebar-height) + var(--shell-inset, 0px) + var(--shell-edge, 0px))',
      }}
    >
      {children}
    </aside>
  );
}
