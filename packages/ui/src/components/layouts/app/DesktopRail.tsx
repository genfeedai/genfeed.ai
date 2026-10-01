'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

type DesktopRailProps = {
  children: ReactNode;
};

/**
 * Fixed app rail at the far left. It never collapses. It shares the window
 * chrome colour with the topbar (`gray-100`) and has no divider of its own.
 * The rounded block to its right holds the menu and the page.
 */
export default function DesktopRail({ children }: DesktopRailProps) {
  const translate = useTranslations('common.appRail');

  return (
    <aside
      aria-label={translate('navigation')}
      data-testid="desktop-app-rail"
      className="fixed bottom-0 left-0 z-30 hidden w-[var(--desktop-rail-width)] flex-col bg-gray-100 md:flex"
      // Flush under the titlebar, full height, same plane as the topbar.
      style={{
        top: 'var(--desktop-titlebar-height)',
      }}
    >
      {children}
    </aside>
  );
}
