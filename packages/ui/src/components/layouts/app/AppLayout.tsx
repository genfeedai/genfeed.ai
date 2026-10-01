'use client';

import { PageHelpProvider } from '@genfeedai/contexts/ui/page-help-context';
import { SidebarNavigationProvider } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppLayoutProps } from '@genfeedai/props/layout/app-layout.props';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Button } from '@ui/primitives/button';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
import CollapsedSidebarToggle from './CollapsedSidebarToggle';
import DesktopRail from './DesktopRail';
import DesktopSidebar from './DesktopSidebar';
import { useAppLayout } from './useAppLayout';

const EMPTY_ARRAY: never[] = [];

export default function AppLayout({
  children,
  bannerComponent,
  menuComponent,
  railComponent,
  topbarComponent,
  providers,
  menuItems = EMPTY_ARRAY,
  breadcrumb,
  currentApp,
  orgSlug,
  brandSlug,
  isWorkspaceShell = false,
  lockViewportHeight = false,
  pageHelp = null,
}: AppLayoutProps) {
  const {
    desktopMenuContent,
    desktopSidebarCollapsedWidth,
    desktopSidebarExpandedWidth,
    handleCloseSidebar,
    handleSidebarResizeKeyDown,
    handleSidebarResizeStart,
    handleToggleDesktopSidebar,
    hasMobileNavigation,
    isDesktopCollapsed,
    isSidebarOpen,
    isSidebarResizing,
    layoutRootRef,
    layoutStyle,
    mainScrollRef,
    mobileMenuContent,
    mobileRailContent,
    mobileSidebarWidth,
    sidebarOffsetTransition,
    topbarProps,
  } = useAppLayout({
    brandSlug,
    currentApp,
    menuComponent,
    orgSlug,
    railComponent,
    topbarComponent,
  });

  // Codex chrome: the rail and the topbar share the window plane. The menu and
  // the page share one rounded block, inset from that plane. The page owns
  // its own scroll (desktop only; mobile keeps document scrolling under the
  // fixed topbar).
  const hasChrome = Boolean(railComponent);
  const TopbarComponent = topbarComponent;
  const topbarContent =
    TopbarComponent && topbarProps ? (
      <TopbarComponent {...topbarProps} />
    ) : null;
  const desktopSidebar = menuComponent ? (
    <DesktopSidebar
      ariaLabel="Navigation"
      collapsedWidth={desktopSidebarCollapsedWidth}
      embedded={hasChrome}
      isCollapsed={isDesktopCollapsed}
      isResizing={isSidebarResizing}
      onResizeKeyDown={handleSidebarResizeKeyDown}
      onResizeStart={handleSidebarResizeStart}
      width={desktopSidebarExpandedWidth}
    >
      {desktopMenuContent}
    </DesktopSidebar>
  ) : null;

  const layoutContent = (
    <SidebarNavigationProvider
      breadcrumb={breadcrumb}
      hasCanonicalPageIdentity={Boolean(topbarContent)}
      items={menuItems}
    >
      <PageHelpProvider help={pageHelp}>
        <div
          ref={layoutRootRef}
          className={cn(
            'overflow-x-hidden',
            hasChrome
              ? cn(
                  'bg-gray-100 [--shell-edge:0px] [--shell-inset:0px] md:[--shell-inset:0.5rem]',
                  topbarContent
                    ? '[--shell-topbar-offset:var(--shell-topbar-height)]'
                    : '[--shell-topbar-offset:0px]',
                )
              : 'bg-background',
            lockViewportHeight ? 'h-dvh overflow-hidden' : 'min-h-screen',
          )}
          data-shell-chrome={hasChrome ? 'true' : undefined}
          data-workspace-shell={isWorkspaceShell ? 'true' : undefined}
          style={layoutStyle}
        >
          {railComponent ? (
            <DesktopRail
              sidebarToggle={
                menuComponent
                  ? {
                      isCollapsed: isDesktopCollapsed,
                      onToggle: handleToggleDesktopSidebar,
                    }
                  : null
              }
            >
              {railComponent}
            </DesktopRail>
          ) : null}
          {menuComponent ? (
            <>
              {/* Without a rail there is no rounded block, so the menu stays a
                  fixed column. With a rail it renders inside the block, and
                  the rail mark is the only collapse control. */}
              {hasChrome ? null : desktopSidebar}
              {isDesktopCollapsed && !topbarContent && !hasChrome ? (
                <CollapsedSidebarToggle onClick={handleToggleDesktopSidebar} />
              ) : null}
            </>
          ) : null}

          {hasMobileNavigation ? (
            <>
              {/* Mobile navigation drawer: app rail beside the module menu */}
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
                  className={
                    'absolute inset-0 bg-black/60' /* design-system-allow-content-color -- navigation scrim */
                  }
                  onClick={handleCloseSidebar}
                />

                <div
                  className={cn(
                    'relative flex h-full max-w-[85vw] border-r border-border bg-gray-100 transition-transform duration-200',
                    isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
                  )}
                  style={{
                    width: mobileMenuContent
                      ? `calc(${mobileSidebarWidth}px + var(--desktop-rail-width))`
                      : 'var(--desktop-rail-width)',
                  }}
                >
                  {mobileRailContent ? (
                    <div
                      // The drawer starts under the fixed topbar (z-50), so the
                      // rail begins below that band or its first app is hidden.
                      className="flex h-full w-[var(--desktop-rail-width)] shrink-0 flex-col bg-foreground/[0.04] pt-[var(--shell-topbar-height)]"
                      data-testid="mobile-app-rail"
                    >
                      {mobileRailContent}
                    </div>
                  ) : null}
                  {mobileMenuContent ? (
                    // Below the fixed topbar, like the rail. The brand
                    // switcher lives in that bar.
                    <div className="h-full min-w-0 flex-1 pt-[var(--shell-topbar-height)]">
                      {mobileMenuContent}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          <section
            data-testid="app-content-shell"
            className={cn(
              'relative flex flex-col',
              hasChrome
                ? cn(
                    // The shell starts after the rail. The topbar is the chrome
                    // band; the rounded block below it carries the menu and the
                    // page. The inspector reserves its width on the right.
                    // Inspector width stays off this shell. The topbar is a child of
                    // it, and padding here slides the topbar's right icons
                    // whenever the details column opens. The panel reserves
                    // that width instead.
                    'bg-background md:bg-transparent md:pl-[var(--desktop-rail-width)] md:pt-[var(--desktop-titlebar-height)]',
                    lockViewportHeight
                      ? 'h-dvh overflow-hidden'
                      : 'min-h-screen md:h-dvh md:min-h-0 md:overflow-hidden',
                  )
                : cn(
                    'bg-background md:pl-[calc(var(--desktop-rail-width)+var(--desktop-sidebar-width))] xl:pr-[var(--workspace-inspector-width,0px)]',
                    lockViewportHeight
                      ? 'h-dvh overflow-hidden'
                      : 'min-h-screen',
                  ),
            )}
            style={{ transition: sidebarOffsetTransition }}
          >
            {topbarContent ? (
              <div
                data-testid="app-topbar-shell"
                className={cn(
                  'fixed top-0 right-0 left-0 z-50 h-[var(--shell-topbar-height)] border-b border-border',
                  hasChrome
                    ? 'bg-gray-100 md:static md:z-auto md:shrink-0 md:border-b-0'
                    : 'bg-background md:left-[calc(var(--desktop-rail-width)+var(--desktop-sidebar-width))] xl:right-[var(--workspace-inspector-width,0px)]',
                )}
                style={{
                  top: 'var(--desktop-titlebar-height)',
                  transition: hasChrome ? undefined : sidebarOffsetTransition,
                }}
              >
                {topbarContent}
              </div>
            ) : null}

            <div
              data-testid="app-content-panel"
              className={cn(
                'flex flex-1 flex-col bg-background',
                // Menu and page, one block. Inset on every side so the radius
                // reads against the rail plane. The inspector squares the
                // right corners and finishes the outer radius.
                hasChrome &&
                  // No top margin: the chips sit in the middle of the topbar, so
                  // an extra inset under the bar made the gap below them twice
                  // the gap above. Left, right, and bottom stay inset.
                  'md:mb-[var(--shell-inset)] md:ml-[var(--shell-inset)] md:mr-[var(--shell-inset)] md:min-h-0 md:flex-row md:overflow-hidden md:rounded-lg md:border md:border-border xl:mr-[calc(var(--shell-inset)+var(--workspace-inspector-width,0px))] xl:[[data-inspector-open=true]_&]:rounded-r-none',
              )}
            >
              {hasChrome ? desktopSidebar : null}
              <main
                ref={mainScrollRef}
                data-testid="app-main-content"
                className={cn(
                  'relative z-0 flex min-w-0 flex-1 flex-col bg-background',
                  hasChrome &&
                    (topbarContent
                      ? 'pt-[calc(var(--desktop-titlebar-height)+var(--shell-topbar-height))] md:pt-0'
                      : 'pt-[var(--desktop-titlebar-height)] md:pt-0'),
                  hasChrome &&
                    !lockViewportHeight &&
                    'md:min-h-0 md:overflow-y-auto',
                  lockViewportHeight && 'min-h-0 overflow-hidden',
                )}
                data-scroll-container={hasChrome ? 'shell' : undefined}
                style={
                  hasChrome
                    ? undefined
                    : {
                        paddingTop: topbarContent
                          ? 'calc(var(--desktop-titlebar-height) + var(--shell-topbar-height))'
                          : 'var(--desktop-titlebar-height)',
                      }
                }
              >
                {bannerComponent ? (
                  <div className="shrink-0" data-testid="app-banner-shell">
                    {bannerComponent}
                  </div>
                ) : null}
                {lockViewportHeight ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {children}
                  </div>
                ) : (
                  children
                )}
              </main>
            </div>
          </section>
        </div>
      </PageHelpProvider>
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
