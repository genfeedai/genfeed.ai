import { isDesktopClient } from '@genfeedai/config/deployment';
import type { AppLayoutProps } from '@genfeedai/props/layout/app-layout.props';
import type { TopbarProps } from '@genfeedai/props/navigation/topbar.props';
import {
  type CSSProperties,
  cloneElement,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  clampAgentPanelHeight,
  clampSidebarWidth,
  persistAgentPanelHeight,
  persistSidebarCollapsed,
  persistSidebarWidth,
  readPersistedAgentPanelHeight,
  readPersistedSidebarCollapsed,
  readPersistedSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './app-layout.utils';

const SIDEBAR_COLLAPSED_WIDTH = 0;
const AGENT_PANEL_HEIGHT = 380;
const DESKTOP_TITLEBAR_HEIGHT = 32;
const SIDEBAR_TRANSITION_DURATION_MS = 300;
const SIDEBAR_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

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
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [sidebarExpandedWidth, setSidebarExpandedWidth] = useState(
    SIDEBAR_DEFAULT_WIDTH,
  );
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
    const persistedWidth = readPersistedSidebarWidth();
    if (persistedWidth !== null) {
      setSidebarExpandedWidth(clampSidebarWidth(persistedWidth));
    } else {
      // Seed from host menu prop (e.g. AppProtectedLayout) once per session.
      const hostWidth = (
        menuComponent as ReactElement<{ sidebarWidth?: number }> | null
      )?.props?.sidebarWidth;
      if (typeof hostWidth === 'number') {
        setSidebarExpandedWidth(clampSidebarWidth(hostWidth));
      }
    }
    setIsSidebarPreferenceLoaded(true);
    // Intentionally run once on mount — resizing is owned by localStorage + state.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host width is a seed only
  }, []);

  useEffect(() => {
    if (!isSidebarPreferenceLoaded) {
      return;
    }

    persistSidebarCollapsed(isDesktopCollapsed);
  }, [isDesktopCollapsed, isSidebarPreferenceLoaded]);

  useEffect(() => {
    if (!isSidebarPreferenceLoaded) {
      return;
    }

    persistSidebarWidth(sidebarExpandedWidth);
  }, [isSidebarPreferenceLoaded, sidebarExpandedWidth]);

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
        // Keep menu shell width in sync with the resizable rail.
        sidebarWidth: sidebarExpandedWidth,
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
    [
      menuComponent,
      handleToggleDesktopSidebar,
      isDesktopCollapsed,
      currentApp,
      sidebarExpandedWidth,
    ],
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
  const desktopSidebarExpandedWidth = sidebarExpandedWidth;
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
    '--desktop-titlebar-height': isDesktopClient()
      ? `${DESKTOP_TITLEBAR_HEIGHT}px`
      : '0px',
  } as CSSProperties;

  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (isDesktopCollapsed) {
        return;
      }

      event.preventDefault();
      setIsSidebarResizing(true);
      const startX = event.clientX;
      const startWidth = sidebarExpandedWidth;

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        setSidebarExpandedWidth(
          clampSidebarWidth(startWidth + moveEvent.clientX - startX),
        );
      };

      const handleMouseUp = (): void => {
        setIsSidebarResizing(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [isDesktopCollapsed, sidebarExpandedWidth],
  );

  const handleSidebarResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 32 : 16;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setSidebarExpandedWidth((current) => clampSidebarWidth(current + step));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSidebarExpandedWidth((current) => clampSidebarWidth(current - step));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setSidebarExpandedWidth(SIDEBAR_MIN_WIDTH);
      } else if (event.key === 'End') {
        event.preventDefault();
        setSidebarExpandedWidth(SIDEBAR_MAX_WIDTH);
      }
    },
    [],
  );

  const handleAgentPanelResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
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

  // `--desktop-sidebar-width` flips instantly when the rail is toggled, so any
  // consumer that offsets itself by that var must ease over the exact same
  // duration/easing as DesktopSidebar's own width animation. Otherwise the
  // content jumps to its final position a frame before the rail starts moving.
  // While dragging the rail, offsets track live without transition lag.
  const sidebarOffsetTransition = isSidebarResizing
    ? 'none'
    : `padding-left ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, padding-right ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, left ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, right ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}`;
  const agentPanelTransition = `height ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, min-height ${SIDEBAR_TRANSITION_DURATION_MS}ms ${SIDEBAR_TRANSITION_EASING}, ${sidebarOffsetTransition}`;

  return {
    agentPanelHeight,
    agentPanelTransition,
    desktopMenuContent,
    desktopSidebarCollapsedWidth,
    desktopSidebarExpandedWidth,
    handleAgentPanelResizeStart,
    handleCloseSidebar,
    handleSidebarResizeKeyDown,
    handleSidebarResizeStart,
    handleToggleDesktopSidebar,
    isDesktopCollapsed,
    isSidebarOpen,
    isSidebarResizing,
    layoutStyle,
    mobileMenuContent,
    mobileSidebarWidth,
    shouldRenderTopbarChrome,
    sidebarOffsetTransition,
    topbarProps,
  };
}
