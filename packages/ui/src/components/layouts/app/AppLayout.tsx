'use client';

import { SidebarNavigationProvider } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppLayoutProps } from '@genfeedai/props/layout/app-layout.props';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Button } from '@ui/primitives/button';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
import CollapsedSidebarLogoToggle from './CollapsedSidebarLogoToggle';
import DesktopSidebar from './DesktopSidebar';
import { useAppLayout } from './useAppLayout';

const EMPTY_ARRAY: never[] = [];

export default function AppLayout({
  children,
  bannerComponent,
  menuComponent,
  topbarComponent,
  providers,
  shellChromeVariant = 'default',
  topbarChromeVariant = 'inherit',
  hasSecondaryTopbar: _hasSecondaryTopbar = false,
  menuItems = EMPTY_ARRAY,
  agentPanel,
  isAgentCollapsed = false,
  onAgentToggle,
  currentApp,
  orgSlug,
  brandSlug,
}: AppLayoutProps) {
  const {
    agentPanelHeight,
    agentPanelTransition,
    desktopMenuContent,
    desktopSidebarCollapsedWidth,
    desktopSidebarExpandedWidth,
    handleAgentPanelResizeStart,
    handleCloseSidebar,
    handleToggleDesktopSidebar,
    isDesktopCollapsed,
    isSidebarOpen,
    layoutStyle,
    mobileMenuContent,
    mobileSidebarWidth,
    shouldRenderTopbarChrome,
    topbarProps,
  } = useAppLayout({
    agentPanel,
    brandSlug,
    currentApp,
    isAgentCollapsed,
    menuComponent,
    onAgentToggle,
    orgSlug,
    shellChromeVariant,
    topbarChromeVariant,
    topbarComponent,
  });

  const TopbarComponent = topbarComponent;
  const topbarContent =
    TopbarComponent && topbarProps ? (
      <TopbarComponent {...topbarProps} />
    ) : null;

  const layoutContent = (
    <SidebarNavigationProvider items={menuItems}>
      <div
        className="ship-ui min-h-screen overflow-x-hidden bg-background"
        style={layoutStyle}
      >
        {menuComponent && (
          <>
            {/* Desktop sidebar */}
            <DesktopSidebar
              collapsedWidth={desktopSidebarCollapsedWidth}
              isCollapsed={isDesktopCollapsed}
              shellChromeVariant={shellChromeVariant}
              width={desktopSidebarExpandedWidth}
            >
              {desktopMenuContent}
            </DesktopSidebar>
            {isDesktopCollapsed ? (
              <CollapsedSidebarLogoToggle
                onClick={handleToggleDesktopSidebar}
              />
            ) : null}

            {/* Mobile sidebar drawer */}
            <div
              className={cn(
                'fixed inset-0 z-40 transition-opacity duration-200 md:hidden',
                isSidebarOpen
                  ? 'flex pointer-events-auto opacity-100'
                  : 'hidden pointer-events-none opacity-0',
              )}
            >
              <Button
                type="button"
                ariaLabel="Close navigation"
                variant={ButtonVariant.UNSTYLED}
                className="absolute inset-0 bg-black/60"
                onClick={handleCloseSidebar}
              />

              <div
                className={cn(
                  'relative h-full max-w-[85vw] border-r border-border bg-background-secondary transition-transform duration-200',
                  isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
                )}
                style={{ width: mobileSidebarWidth }}
              >
                {mobileMenuContent}
              </div>
            </div>
          </>
        )}

        <section
          data-testid="app-content-shell"
          className="relative min-h-screen bg-background md:pl-[var(--desktop-sidebar-width)] lg:pb-[var(--desktop-agent-height)]"
        >
          {topbarContent ? (
            <div
              data-testid="app-topbar-shell"
              className={cn(
                'fixed top-0 right-0 left-0 z-50 h-12 md:left-[var(--desktop-sidebar-width)]',
                shouldRenderTopbarChrome && 'bg-background',
              )}
              style={{
                top: 'var(--desktop-titlebar-height)',
              }}
            >
              {topbarContent}
            </div>
          ) : null}

          <main
            data-testid="app-main-content"
            className={cn('relative z-0 bg-background')}
            style={{
              paddingTop: topbarContent
                ? 'calc(var(--desktop-titlebar-height) + 3rem)'
                : 'var(--desktop-titlebar-height)',
            }}
          >
            {bannerComponent ? (
              <div data-testid="app-banner-shell">{bannerComponent}</div>
            ) : null}
            {children}
          </main>
        </section>

        {/* Agent panel bottom dock — animated via topbar toggle or Cmd+L */}
        {agentPanel && !isAgentCollapsed && (
          <aside
            data-testid="agent-panel-rail"
            className={cn(
              'fixed right-0 bottom-0 left-0 z-20 hidden overflow-hidden lg:flex',
              shellChromeVariant === 'transparent'
                ? !isAgentCollapsed && 'bg-transparent shadow-none'
                : 'bg-background-secondary',
              shellChromeVariant === 'transparent' && 'shadow-none',
              menuComponent && 'md:left-[var(--desktop-sidebar-width)]',
            )}
            style={{
              height: agentPanelHeight,
              minHeight: agentPanelHeight,
              transition: agentPanelTransition,
            }}
          >
            <div
              data-testid="agent-panel-resize-handle"
              role="button"
              aria-label="Resize agent panel"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
              }}
              className="absolute top-0 left-0 right-0 z-10 h-1.5 cursor-row-resize border-t border-border"
              onMouseDown={handleAgentPanelResizeStart}
            />
            <div
              data-testid="agent-panel-shell"
              className="absolute inset-x-0 bottom-0 flex flex-col"
              style={{
                height: agentPanelHeight,
                minHeight: agentPanelHeight,
              }}
            >
              {agentPanel}
            </div>
          </aside>
        )}
      </div>
    </SidebarNavigationProvider>
  );

  return (
    <ErrorBoundary>
      {providers
        ? (cloneElement(providers as ReactElement<{ children: ReactNode }>, {
            children: layoutContent,
          }) as ReactElement)
        : layoutContent}
    </ErrorBoundary>
  );
}
