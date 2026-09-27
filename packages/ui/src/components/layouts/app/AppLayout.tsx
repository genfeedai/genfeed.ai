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

  // Codex/Slack chrome: rail + sidebar share one surface and the page sits in
  // an inset, bordered panel that owns its own scroll (desktop only; mobile
  // keeps document scrolling under the fixed topbar).
  const hasChrome = Boolean(railComponent);
  const TopbarComponent = topbarComponent;
  const topbarContent =
    TopbarComponent && topbarProps ? (
      <TopbarComponent {...topbarProps} />
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
              ? 'bg-gray-100 [--shell-inset:0px] md:[--shell-inset:0.5rem]'
              : 'bg-background',
            lockViewportHeight ? 'h-dvh overflow-hidden' : 'min-h-screen',
          )}
          data-workspace-shell={isWorkspaceShell ? 'true' : undefined}
          style={layoutStyle}
        >
          {railComponent ? <DesktopRail>{railComponent}</DesktopRail> : null}
          {menuComponent && (
            <>
              {/* Desktop sidebar */}
              {/* Always "Navigation": the column belongs to whichever module owns
              the surface, and only that module decides what goes in it. It was
              named after the conversation back when the conversation was the
              only thing that could be in there. */}
              <DesktopSidebar
                ariaLabel="Navigation"
                collapsedWidth={desktopSidebarCollapsedWidth}
                isCollapsed={isDesktopCollapsed}
                isResizing={isSidebarResizing}
                onResizeKeyDown={handleSidebarResizeKeyDown}
                onResizeStart={handleSidebarResizeStart}
                width={desktopSidebarExpandedWidth}
              >
                {desktopMenuContent}
              </DesktopSidebar>
              {isDesktopCollapsed && !topbarContent ? (
                <CollapsedSidebarToggle onClick={handleToggleDesktopSidebar} />
              ) : null}
            </>
          )}

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
                      className="flex h-full w-[var(--desktop-rail-width)] shrink-0 flex-col pt-12"
                      data-testid="mobile-app-rail"
                    >
                      {mobileRailContent}
                    </div>
                  ) : null}
                  {mobileMenuContent ? (
                    <div className="h-full min-w-0 flex-1">
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
                    'bg-background md:bg-transparent md:pl-[calc(var(--desktop-rail-width)+var(--desktop-sidebar-width))] md:pt-[calc(var(--desktop-titlebar-height)+var(--shell-inset))] md:pr-[var(--shell-inset)] md:pb-[var(--shell-inset)]',
                    // The inspector floats as its own panel: reserve its width
                    // plus one inset gap, and no gap while it is collapsed.
                    'xl:pr-[calc(var(--shell-inset)+var(--workspace-inspector-width,0px)+min(var(--workspace-inspector-width,0px),var(--shell-inset)))]',
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
            <div
              data-testid="app-content-panel"
              className={cn(
                'flex flex-1 flex-col bg-background',
                hasChrome &&
                  'md:min-h-0 md:overflow-hidden md:rounded-lg md:border md:border-border',
              )}
            >
              {topbarContent ? (
                <div
                  data-testid="app-topbar-shell"
                  className={cn(
                    'fixed top-0 right-0 left-0 z-50 h-12 border-b border-border bg-background',
                    hasChrome
                      ? 'md:static md:z-auto md:shrink-0'
                      : 'md:left-[calc(var(--desktop-rail-width)+var(--desktop-sidebar-width))] xl:right-[var(--workspace-inspector-width,0px)]',
                  )}
                  style={{
                    top: 'var(--desktop-titlebar-height)',
                    transition: hasChrome ? undefined : sidebarOffsetTransition,
                  }}
                >
                  {topbarContent}
                </div>
              ) : null}

              <main
                ref={mainScrollRef}
                data-testid="app-main-content"
                className={cn(
                  'relative z-0 flex flex-1 flex-col bg-background',
                  hasChrome &&
                    (topbarContent
                      ? 'pt-[calc(var(--desktop-titlebar-height)+3rem)] md:pt-0'
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
                          ? 'calc(var(--desktop-titlebar-height) + 3rem)'
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
