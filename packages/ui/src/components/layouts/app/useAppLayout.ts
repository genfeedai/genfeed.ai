import type { AppLayoutProps } from '@genfeedai/props/layout/app-layout.props';
import type { TopbarProps } from '@genfeedai/props/navigation/topbar.props';
import {
  type CSSProperties,
  cloneElement,
  type ReactElement,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  clampAgentPanelHeight,
  persistAgentPanelHeight,
  persistSidebarCollapsed,
  readPersistedAgentPanelHeight,
  readPersistedSidebarCollapsed,
} from './app-layout.utils';

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 0;
const AGENT_PANEL_HEIGHT = 380;
const DESKTOP_TITLEBAR_HEIGHT = 32;
const SIDEBAR_TRANSITION_DURATION_MS = 300;
const SIDEBAR_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const IS_DESKTOP_SHELL = process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';

type UseAppLayoutParams = Pick<
  AppLayoutProps,
  | 'menuComponent'
  | 'topbarComponent'
  | 'shellChromeVariant'
  | 'topbarChromeVariant'
  | 'agentPanel'
  | 'isAgentCollapsed'
  | 'onAgentToggle'
  | 'currentApp'
  | 'orgSlug'
  | 'brandSlug'
>;

export function useAppLayout({
  menuComponent,
  topbarComponent,
  shellChromeVariant = 'default',
  topbarChromeVariant = 'inherit',
  agentPanel,
  isAgentCollapsed = false,
  onAgentToggle,
  currentApp,
  orgSlug,
  brandSlug,
}: UseAppLayoutParams) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [isSidebarPreferenceLoaded, setIsSidebarPreferenceLoaded] =
    useState(false);
  const [agentPanelHeight, setAgentPanelHeight] =
    useState<number>(AGENT_PANEL_HEIGHT);

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

  useEffect(() => {
    const persistedHeight = readPersistedAgentPanelHeight();
    if (persistedHeight === null) {
      return;
    }

    setAgentPanelHeight(clampAgentPanelHeight(persistedHeight));
  }, []);

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
        currentApp?: string;
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
        currentApp,
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
    [menuComponent, handleToggleDesktopSidebar, isDesktopCollapsed, currentApp],
  );

  const topbarProps: TopbarProps | undefined = useMemo(() => {
    if (!topbarComponent) {
      return undefined;
    }

    const effectiveAgentToggle = agentPanel ? onAgentToggle : undefined;

    return {
      brandSlug,
      currentApp,
      isAgentCollapsed,
      isMenuOpen: isSidebarOpen,
      isSidebarCollapsed: isDesktopCollapsed,
      onAgentToggle: effectiveAgentToggle,
      onMenuToggle: handleToggleSidebar,
      onSidebarToggle: handleToggleDesktopSidebar,
      orgSlug,
    };
  }, [
    brandSlug,
    currentApp,
    handleToggleSidebar,
    handleToggleDesktopSidebar,
    isDesktopCollapsed,
    isSidebarOpen,
    isAgentCollapsed,
    agentPanel,
    onAgentToggle,
    orgSlug,
    topbarComponent,
  ]);

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
  const desktopAgentHeight =
    agentPanel && !isAgentCollapsed ? agentPanelHeight : 0;

  const layoutStyle = {
    '--desktop-agent-height': `${desktopAgentHeight}px`,
    '--desktop-sidebar-width': `${desktopSidebarWidth}px`,
    '--desktop-titlebar-height': IS_DESKTOP_SHELL
      ? `${DESKTOP_TITLEBAR_HEIGHT}px`
      : '0px',
  } as CSSProperties;

  const handleAgentPanelResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isAgentCollapsed) {
        return;
      }

      event.preventDefault();

      const startY = event.clientY;
      const startHeight = agentPanelHeight;
      let nextHeight = startHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startY - moveEvent.clientY;
        nextHeight = clampAgentPanelHeight(startHeight + delta);
        setAgentPanelHeight(nextHeight);
      };

      const handleMouseUp = () => {
        setAgentPanelHeight(nextHeight);
        persistAgentPanelHeight(nextHeight);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [agentPanelHeight, isAgentCollapsed],
  );

  const resolvedTopbarChromeVariant =
    topbarChromeVariant === 'inherit'
      ? shellChromeVariant
      : topbarChromeVariant;
  const shouldRenderTopbarChrome = resolvedTopbarChromeVariant === 'default';

  const desktopMenuContent = renderMenu();
  const mobileMenuContent = renderMenu({
    isCollapsed: false,
    onClose: handleCloseSidebar,
  });

  const agentPanelTransition = `height ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, min-height ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}`;

  return {
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
  };
}
