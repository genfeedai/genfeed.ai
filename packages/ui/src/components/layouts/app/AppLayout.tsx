'use client';

import { SidebarNavigationProvider } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppLayoutProps } from '@genfeedai/props/layout/app-layout.props';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Button } from '@ui/primitives/button';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
import CollapsedSidebarToggle from './CollapsedSidebarToggle';
import DesktopSidebar from './DesktopSidebar';
import { useAppLayout } from './useAppLayout';

const EMPTY_ARRAY: never[] = [];

export default function AppLayout({
  children,
  bannerComponent,
  menuComponent,
  topbarComponent,
  providers,
  menuItems = EMPTY_ARRAY,
  breadcrumb,
  currentApp,
  orgSlug,
  brandSlug,
  isWorkspaceShell = false,
  lockViewportHeight = false,
}: AppLayoutProps) {
  const {
    desktopMenuContent,
    desktopSidebarCollapsedWidth,
    desktopSidebarExpandedWidth,
    handleCloseSidebar,
    handleSidebarResizeKeyDown,
    handleSidebarResizeStart,
    handleToggleDesktopSidebar,
    isDesktopCollapsed,
    isSidebarOpen,
    isSidebarResizing,
    layoutRootRef,
    layoutStyle,
    mobileMenuContent,
    mobileSidebarWidth,
    sidebarOffsetTransition,
    topbarProps,
  } = useAppLayout({
    brandSlug,
    currentApp,
    menuComponent,
    orgSlug,
    topbarComponent,
  });

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
      <div
        ref={layoutRootRef}
        className={cn(
          'overflow-x-hidden bg-background',
          lockViewportHeight ? 'h-dvh overflow-hidden' : 'min-h-screen',
        )}
        data-workspace-shell={isWorkspaceShell ? 'true' : undefined}
        style={layoutStyle}
      >
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
                className={
                  'absolute inset-0 bg-black/60' /* design-system-allow-content-color -- navigation scrim */
                }
                onClick={handleCloseSidebar}
              />

              <div
                className={cn(
                  'relative h-full max-w-[85vw] border-r border-border bg-background transition-transform duration-200',
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
          className={cn(
            'relative bg-background md:pl-[var(--desktop-sidebar-width)] xl:pr-[var(--workspace-inspector-width,0px)]',
            lockViewportHeight
              ? 'flex h-dvh flex-col overflow-hidden'
              : 'min-h-screen',
          )}
          style={{ transition: sidebarOffsetTransition }}
        >
          {topbarContent ? (
            <div
              data-testid="app-topbar-shell"
              className={cn(
                'fixed top-0 right-0 left-0 z-50 h-12 border-b border-border bg-background md:left-[var(--desktop-sidebar-width)] xl:right-[var(--workspace-inspector-width,0px)]',
              )}
              style={{
                top: 'var(--desktop-titlebar-height)',
                transition: sidebarOffsetTransition,
              }}
            >
              {topbarContent}
            </div>
          ) : null}

          <main
            data-testid="app-main-content"
            className={cn(
              'relative z-0 bg-background',
              lockViewportHeight &&
                'flex min-h-0 flex-1 flex-col overflow-hidden',
            )}
            style={{
              paddingTop: topbarContent
                ? 'calc(var(--desktop-titlebar-height) + 3rem)'
                : 'var(--desktop-titlebar-height)',
            }}
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
        </section>
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
