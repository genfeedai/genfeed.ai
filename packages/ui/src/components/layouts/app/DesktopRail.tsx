'use client';

import SidebarLogoToggleButton from '@ui/menus/sidebar-logo-toggle/SidebarLogoToggleButton';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

type DesktopRailSidebarToggle = {
  isCollapsed: boolean;
  onToggle: () => void;
};

type DesktopRailProps = {
  children: ReactNode;
  sidebarToggle?: DesktopRailSidebarToggle | null;
};

/**
 * Fixed app rail at the far left. It never collapses. It shares the window
 * chrome colour with the topbar (`gray-100`) and has no divider of its own.
 * The rounded block to its right holds the menu and the page.
 * The top band matches the topbar (`h-12`) and holds the Genfeed mark, which
 * collapses the module sidebar.
 */
export default function DesktopRail({
  children,
  sidebarToggle = null,
}: DesktopRailProps) {
  const translateRail = useTranslations('common.appRail');
  const translateSidebar = useTranslations('common.sidebar');

  return (
    <aside
      aria-label={translateRail('navigation')}
      data-testid="desktop-app-rail"
      className="fixed bottom-0 left-0 z-30 hidden w-[var(--desktop-rail-width)] flex-col bg-gray-100 md:flex"
      // Flush under the titlebar, full height, same plane as the topbar.
      style={{
        top: 'var(--desktop-titlebar-height)',
      }}
    >
      <div
        className="flex h-12 shrink-0 items-center justify-center"
        data-testid="app-rail-mark"
      >
        {sidebarToggle ? (
          <SidebarLogoToggleButton
            ariaLabel={
              sidebarToggle.isCollapsed
                ? translateSidebar('expand')
                : translateSidebar('collapse')
            }
            direction={sidebarToggle.isCollapsed ? 'expand' : 'collapse'}
            onClick={sidebarToggle.onToggle}
          />
        ) : null}
      </div>
      {children}
    </aside>
  );
}
