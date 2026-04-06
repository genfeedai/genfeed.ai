'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import CoreSidebar, {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_WIDTH,
} from './CoreSidebar';
import CoreTopbar from './CoreTopbar';

const SIDEBAR_TRANSITION_DURATION_MS = 300;
const SIDEBAR_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SIDEBAR_STORAGE_KEY = 'genfeed:core:sidebar:collapsed';

function readPersistedSidebarCollapsed(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function persistSidebarCollapsed(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage write failures
  }
}

/** Desktop sidebar rail — animates width, clips overflow. */
function DesktopSidebar({
  children,
  isCollapsed,
}: {
  children: ReactNode;
  isCollapsed: boolean;
}) {
  const targetWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <aside
      data-testid="desktop-sidebar-rail"
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden md:flex',
        'bg-background/95 shadow-[18px_0_48px_rgba(0,0,0,0.18)]',
        !isCollapsed && 'border-r border-white/[0.12]',
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

interface CoreAppShellProps {
  children: ReactNode;
}

export default function CoreAppShell({ children }: CoreAppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [isSidebarPreferenceLoaded, setIsSidebarPreferenceLoaded] =
    useState(false);

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const handleToggleDesktopSidebar = useCallback(() => {
    setIsDesktopCollapsed((prev) => !prev);
  }, []);

  // Load persisted sidebar preference
  useEffect(() => {
    const persisted = readPersistedSidebarCollapsed();
    if (persisted !== null) {
      setIsDesktopCollapsed(persisted);
    }
    setIsSidebarPreferenceLoaded(true);
  }, []);

  // Persist sidebar preference
  useEffect(() => {
    if (!isSidebarPreferenceLoaded) return;
    persistSidebarCollapsed(isDesktopCollapsed);
  }, [isDesktopCollapsed, isSidebarPreferenceLoaded]);

  // Cmd+B toggles desktop sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (isEditable) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        handleToggleDesktopSidebar();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleDesktopSidebar]);

  // Body scroll lock when mobile sidebar open
  useEffect(() => {
    if (isSidebarOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    return;
  }, [isSidebarOpen]);

  const desktopSidebarWidth = isDesktopCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : SIDEBAR_WIDTH;

  const layoutStyle = {
    '--desktop-sidebar-width': `${desktopSidebarWidth}px`,
  } as CSSProperties;

  return (
    <div
      className="min-h-screen overflow-x-hidden bg-background"
      style={layoutStyle}
    >
      {/* Desktop sidebar */}
      <DesktopSidebar isCollapsed={isDesktopCollapsed}>
        <CoreSidebar
          isCollapsed={isDesktopCollapsed}
          onToggleCollapse={handleToggleDesktopSidebar}
        />
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
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          ariaLabel="Close navigation"
          className="absolute inset-0 bg-black/60"
          onClick={handleCloseSidebar}
        />
        <div
          className={cn(
            'relative h-full max-w-[85vw] bg-background shadow-2xl transition-transform duration-200',
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          style={{ width: SIDEBAR_WIDTH }}
        >
          <CoreSidebar isCollapsed={false} onClose={handleCloseSidebar} />
        </div>
      </div>

      {/* Content area */}
      <section
        data-testid="core-content-shell"
        className="relative min-h-screen bg-background md:pl-[var(--desktop-sidebar-width)]"
      >
        {/* Topbar */}
        <div
          data-testid="core-topbar-shell"
          className={cn(
            'fixed top-0 right-0 left-0 z-50 h-16',
            'md:left-[var(--desktop-sidebar-width)]',
            'border-b border-white/[0.08] bg-background/80 backdrop-blur-xl',
          )}
        >
          <CoreTopbar
            isMenuOpen={isSidebarOpen}
            onMenuToggle={handleToggleSidebar}
          />
        </div>

        {/* Main content */}
        <main
          data-testid="core-main-content"
          className="relative z-0 bg-background pt-16"
        >
          {children}
        </main>
      </section>
    </div>
  );
}
