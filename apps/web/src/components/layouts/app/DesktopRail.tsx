'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import SidebarLogoMark from '@/components/menus/sidebar-logo-toggle/SidebarLogoMark';
import SidebarLogoToggleButton from '@/components/menus/sidebar-logo-toggle/SidebarLogoToggleButton';

type DesktopRailSidebarToggle = {
  isCollapsed: boolean;
  onToggle: () => void;
};

type DesktopRailProps = {
  children: ReactNode;
  /**
   * The macOS traffic lights float over the top band and run past the rail's
   * edge, so the rail's right divider starts below the band instead of
   * cutting through them.
   */
  hasInlineTrafficLights?: boolean;
  /** Show the plain mark (no hover or click) when there is no sidebar to toggle. */
  hasStaticMark?: boolean;
  sidebarToggle?: DesktopRailSidebarToggle | null;
};

/**
 * Fixed app rail at the far left, the full window height. It never collapses.
 * It is one step off the page (`gray-100`) and divided from it by a 1px right
 * border. The top band matches the topbar row (48px), shares its bottom line
 * and holds the Genfeed mark, which collapses the module sidebar, or stays a
 * plain mark on pages without one. On macOS desktop the traffic lights cover
 * the band, and the mark moves into the topbar (`DesktopTitlebarControls`).
 */
export default function DesktopRail({
  children,
  hasInlineTrafficLights = false,
  hasStaticMark = false,
  sidebarToggle = null,
}: DesktopRailProps) {
  const translateRail = useTranslations('common.appRail');
  const translateSidebar = useTranslations('common.sidebar');

  return (
    <aside
      aria-label={translateRail('navigation')}
      data-testid="desktop-app-rail"
      className={cn(
        'fixed bottom-0 left-0 z-30 hidden w-[var(--desktop-rail-width)] flex-col bg-gray-100 md:flex',
        !hasInlineTrafficLights && 'border-r border-border',
      )}
      // Flush under the titlebar, full height, same plane as the topbar.
      style={{
        top: 'var(--desktop-titlebar-height)',
      }}
    >
      <div
        className="flex h-[var(--shell-topbar-height)] shrink-0 items-center justify-center border-b border-border"
        // Empty under the macOS traffic lights; it drags the window there.
        data-desktop-drag="true"
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
        ) : hasStaticMark ? (
          <SidebarLogoMark />
        ) : null}
      </div>
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          hasInlineTrafficLights && 'border-r border-border',
        )}
      >
        {children}
      </div>
    </aside>
  );
}
