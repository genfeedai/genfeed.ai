'use client';

import { SidebarNavigationProvider } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppLayoutProps } from '@genfeedai/props/layout/app-layout.props';
import type { TopbarProps } from '@genfeedai/props/navigation/topbar.props';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Button } from '@ui/primitives/button';
import {
  type CSSProperties,
  cloneElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 48;
const AGENT_PANEL_WIDTH = 380;
const AGENT_COLLAPSED_WIDTH = 48;
const SIDEBAR_TRANSITION_DURATION_MS = 300;
const SIDEBAR_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SIDEBAR_COLLAPSED_STORAGE_PREFIX = 'genfeed:sidebar:collapsed';

function getSidebarCollapsedStorageKey(): string {
  if (typeof window === 'undefined') {
    return `${SIDEBAR_COLLAPSED_STORAGE_PREFIX}:anon`;
  }

  const clerk = window.Clerk as { user?: { id?: string } } | undefined;
  const userId = clerk?.user?.id ?? 'anon';
  return `${SIDEBAR_COLLAPSED_STORAGE_PREFIX}:${userId}`;
}

function readPersistedSidebarCollapsed(): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(getSidebarCollapsedStorageKey());
    if (stored === 'true') {
      return true;
    }
    if (stored === 'false') {
      return false;
    }
    return null;
  } catch {
    return null;
  }
}

function persistSidebarCollapsed(nextValue: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      getSidebarCollapsedStorageKey(),
      String(nextValue),
    );
  } catch {
    // Ignore storage write failures (private mode, quota, etc.)
  }
}

/**
 * Desktop sidebar wrapper — animates width between 240px and 48px with overflow:hidden.
 * MenuShared always renders at full 240px; this container clips content during collapse.
 */
function DesktopSidebar({
  children,
  collapsedWidth = SIDEBAR_COLLAPSED_WIDTH,
  isCollapsed,
  shellChromeVariant,
  width = SIDEBAR_WIDTH,
}: {
  children: ReactNode;
  collapsedWidth?: number;
  isCollapsed: boolean;
  shellChromeVariant: 'default' | 'transparent';
  width?: number;
}) {
  const targetWidth = isCollapsed ? collapsedWidth : width;

  return (
    <aside
      data-testid="desktop-sidebar-rail"
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden md:flex',
        shellChromeVariant === 'default'
          ? 'bg-background/95 shadow-[18px_0_48px_rgba(0,0,0,0.18)]'
          : 'bg-transparent shadow-none',
        !isCollapsed && 'border-r border-white/[0.08]',
      )}
      style={{
        minWidth: targetWidth,
        transition: `width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, min-width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}`,
        width: targetWidth,
      }}
    >
      {children}
    </aside>
  );
}

export default function AppLayout({
  children,
  bannerComponent,
  menuComponent,
  topbarComponent,
  providers,
  shellChromeVariant = 'default',
  topbarChromeVariant = 'inherit',
  hasSecondaryTopbar: _hasSecondaryTopbar = false,
  menuItems = [],
  agentPanel,
  isAgentCollapsed = false,
  onAgentToggle,
  currentApp,
  orgSlug,
  brandSlug,
}: AppLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [isSidebarPreferenceLoaded, setIsSidebarPreferenceLoaded] =
    useState(false);

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((previous) => !previous);
  }, []);

  const handleToggleDesktopSidebar = useCallback(() => {
    setIsDesktopCollapsed((previous) => !previous);
  }, []);

  useEffect(() => {
    const persistedValue = readPersistedSidebarCollapsed();
    if (persistedValue !== null) {
      setIsDesktopCollapsed(persistedValue);
    }
    setIsSidebarPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!isSidebarPreferenceLoaded) {
      return;
    }

    persistSidebarCollapsed(isDesktopCollapsed);
  }, [isDesktopCollapsed, isSidebarPreferenceLoaded]);

  // Cmd+B toggles sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isEditable) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 'b') {
        e.preventDefault();
        handleToggleDesktopSidebar();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleDesktopSidebar]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      handleCloseSidebar();
    }, 0);

    return () => clearTimeout(timeout);
  }, [handleCloseSidebar]);

  useEffect(() => {
    if (!menuComponent) {
      return;
    }

    if (isSidebarOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }

    return;
  }, [isSidebarOpen, menuComponent]);

  const renderMenu = useCallback(
    (extraProps: Record<string, unknown> = {}) => {
      if (!menuComponent) {
        return null;
      }

      const element = menuComponent as ReactElement<{
        collapsedSidebarWidth?: number;
        isCollapsed?: boolean;
        mobileSidebarWidth?: number;
        onClose?: (...args: unknown[]) => void;
        onToggleCollapse?: () => void;
        sidebarWidth?: number;
      }>;
      const originalOnClose = element.props?.onClose;
      const extraOnClose = extraProps.onClose as
        | ((...args: unknown[]) => void)
        | undefined;

      return cloneElement(element, {
        ...(element.props as Record<string, unknown>),
        ...extraProps,
        isCollapsed:
          (extraProps.isCollapsed as boolean | undefined) ?? isDesktopCollapsed,
        onClose: (...args: unknown[]) => {
          if (extraOnClose) {
            extraOnClose(...args);
          }

          if (typeof originalOnClose === 'function') {
            (originalOnClose as (...innerArgs: unknown[]) => void)(...args);
          }
        },
        onToggleCollapse: handleToggleDesktopSidebar,
      });
    },
    [menuComponent, handleToggleDesktopSidebar, isDesktopCollapsed],
  );

  const topbarProps: TopbarProps | undefined = useMemo(() => {
    if (!topbarComponent) {
      return undefined;
    }

    return {
      brandSlug,
      currentApp,
      isAgentCollapsed,
      isMenuOpen: isSidebarOpen,
      onAgentToggle,
      onMenuToggle: handleToggleSidebar,
      orgSlug,
    };
  }, [
    brandSlug,
    currentApp,
    handleToggleSidebar,
    isSidebarOpen,
    isAgentCollapsed,
    onAgentToggle,
    orgSlug,
    topbarComponent,
  ]);

  const TopbarComponent = topbarComponent;
  const topbarContent =
    TopbarComponent && topbarProps ? (
      <TopbarComponent {...topbarProps} />
    ) : null;
  const resolvedTopbarChromeVariant =
    topbarChromeVariant === 'inherit'
      ? shellChromeVariant
      : topbarChromeVariant;
  const shouldRenderTopbarChrome = resolvedTopbarChromeVariant === 'default';
  const menuElement = menuComponent as ReactElement<{
    collapsedSidebarWidth?: number;
    mobileSidebarWidth?: number;
    sidebarWidth?: number;
  }> | null;
  const desktopSidebarExpandedWidth =
    menuElement?.props?.sidebarWidth ?? SIDEBAR_WIDTH;
  const desktopSidebarCollapsedWidth =
    menuElement?.props?.collapsedSidebarWidth ?? SIDEBAR_COLLAPSED_WIDTH;
  const mobileSidebarWidth =
    menuElement?.props?.mobileSidebarWidth ?? desktopSidebarExpandedWidth;
  const desktopSidebarWidth = menuComponent
    ? isDesktopCollapsed
      ? desktopSidebarCollapsedWidth
      : desktopSidebarExpandedWidth
    : 0;
  const desktopAgentWidth = agentPanel
    ? isAgentCollapsed
      ? AGENT_COLLAPSED_WIDTH
      : AGENT_PANEL_WIDTH
    : 0;
  const layoutStyle = {
    '--desktop-agent-width': `${desktopAgentWidth}px`,
    '--desktop-sidebar-width': `${desktopSidebarWidth}px`,
  } as CSSProperties;

  const layoutContent = (
    <SidebarNavigationProvider items={menuItems}>
      <div
        className="min-h-screen overflow-x-hidden bg-background"
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
              {renderMenu()}
            </DesktopSidebar>

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
                  'relative h-full max-w-[85vw] bg-background shadow-2xl transition-transform duration-200',
                  isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
                )}
                style={{ width: mobileSidebarWidth }}
              >
                {renderMenu({
                  isCollapsed: false,
                  onClose: handleCloseSidebar,
                })}
              </div>
            </div>
          </>
        )}

        <section
          data-testid="app-content-shell"
          className="relative min-h-screen bg-background md:pl-[var(--desktop-sidebar-width)] lg:pr-[var(--desktop-agent-width)]"
        >
          {topbarContent ? (
            <div
              data-testid="app-topbar-shell"
              className={cn(
                'fixed top-0 right-0 left-0 z-50 h-16 md:left-[var(--desktop-sidebar-width)] lg:right-[var(--desktop-agent-width)]',
                shouldRenderTopbarChrome &&
                  'border-b border-white/[0.08] bg-background/80 backdrop-blur-xl',
              )}
            >
              {topbarContent}
            </div>
          ) : null}

          <main
            data-testid="app-main-content"
            className={cn(
              'relative z-0 bg-background',
              topbarContent && 'pt-16',
            )}
          >
            {bannerComponent ? (
              <div data-testid="app-banner-shell">{bannerComponent}</div>
            ) : null}
            {children}
          </main>
        </section>

        {/* Agent panel (right side) — animated via topbar toggle or Cmd+L */}
        {agentPanel && (
          <aside
            data-testid="agent-panel-rail"
            className={cn(
              'fixed inset-y-0 right-0 z-20 hidden flex-col overflow-hidden lg:flex',
              shellChromeVariant === 'transparent'
                ? !isAgentCollapsed &&
                    'border-l border-white/[0.08] bg-transparent shadow-none'
                : 'border-l border-white/[0.08]',
              shellChromeVariant === 'transparent'
                ? 'shadow-none'
                : isAgentCollapsed
                  ? 'bg-background'
                  : 'bg-background/95',
            )}
            style={{
              minWidth: isAgentCollapsed
                ? AGENT_COLLAPSED_WIDTH
                : AGENT_PANEL_WIDTH,
              transition: `width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, min-width ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}`,
              width: isAgentCollapsed
                ? AGENT_COLLAPSED_WIDTH
                : AGENT_PANEL_WIDTH,
            }}
          >
            <div
              data-testid="agent-panel-shell"
              className="absolute inset-y-0 right-0 flex flex-col"
              style={{
                minWidth: AGENT_PANEL_WIDTH,
                width: AGENT_PANEL_WIDTH,
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
