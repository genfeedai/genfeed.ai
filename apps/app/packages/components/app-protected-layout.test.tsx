import {
  ENTITY_OVERLAY_CLOSED_EVENT,
  ENTITY_OVERLAY_OPENED_EVENT,
} from '@services/core/agent-overlay-coordination.service';
import { render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppProtectedLayout from './app-protected-layout';

const {
  appLayoutSpy,
  appSidebarSpy,
  agentPanelSpy,
  beginOverlaySessionSpy,
  endOverlaySessionSpy,
  onboardingGuardSpy,
  lowCreditsBannerSpy,
  protectedProvidersSpy,
  setIsOpenSpy,
  toggleOpenSpy,
} = vi.hoisted(() => ({
  agentPanelSpy: vi.fn(),
  appLayoutSpy: vi.fn(),
  appSidebarSpy: vi.fn(),
  beginOverlaySessionSpy: vi.fn(),
  endOverlaySessionSpy: vi.fn(),
  lowCreditsBannerSpy: vi.fn(),
  onboardingGuardSpy: vi.fn(),
  protectedProvidersSpy: vi.fn(),
  setIsOpenSpy: vi.fn(),
  toggleOpenSpy: vi.fn(),
}));

const mockPathname = vi.hoisted(() => ({
  value: '/workspace',
}));

const mockBrandState = vi.hoisted(() => ({
  brandId: 'brand-123',
}));

const enabledCategoriesState = vi.hoisted(() => ({
  enabledCategories: ['image', 'video', 'avatar'],
  isLoading: false,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue('token'),
  }),
}));

vi.mock('@ui/command-palette/command-palette/CommandPalette', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}));

vi.mock(
  '@ui/command-palette/command-palette-initializer/CommandPaletteInitializer',
  () => ({
    CommandPaletteInitializer: () => null,
  }),
);

vi.mock('@ui/layouts/app/AppLayout', () => ({
  default: ({
    bannerComponent,
    children,
    menuComponent,
    agentPanel,
    renderBody,
    ...props
  }: {
    bannerComponent?: ReactNode;
    children: ReactNode;
    agentPanel?: ReactNode;
    menuComponent?: ReactNode;
    renderBody?: () => ReactNode;
    shellChromeVariant?: 'default' | 'transparent';
    topbarChromeVariant?: 'inherit' | 'default' | 'transparent';
  }) => {
    appLayoutSpy({ bannerComponent, ...props });
    return (
      <div data-testid="app-layout">
        {menuComponent}
        {bannerComponent}
        {agentPanel ? (
          <div data-testid="agent-panel-rail">{agentPanel}</div>
        ) : null}
        {children}
      </div>
    );
  },
}));

vi.mock('@ui/shell/menus/AppSidebar', () => ({
  default: (props: {
    conversationActions?: ReactNode;
    collapsedSidebarWidth?: number;
    shellChromeVariant?: 'default' | 'transparent';
    mobileSidebarWidth?: number;
    primaryAction?:
      | { href: string; label: string }
      | { onClick: () => void; label: string };
    secondaryItems?: { href: string; label: string }[];
    renderBody?: () => ReactNode;
    renderAfterNavigation?: () => ReactNode;
    renderTopSlot?: () => ReactNode;
    shellMode?: 'default' | 'workspace';
    showOrganizationSwitcher?: boolean;
    showPrimaryItems?: boolean;
    sidebarWidth?: number;
    backHref?: string;
    backLabel?: string;
  }) => {
    appSidebarSpy(props);
    return (
      <div data-testid="app-sidebar">
        {props.renderTopSlot ? props.renderTopSlot() : null}
        {props.renderBody ? props.renderBody() : null}
        {props.conversationActions ? (
          <div data-testid="conversation-actions-slot">
            {props.conversationActions}
          </div>
        ) : null}
        {props.renderAfterNavigation ? props.renderAfterNavigation() : null}
      </div>
    );
  },
}));

vi.mock('@app-components/streaks/StreakNotificationsBridge', () => ({
  default: () => <div data-testid="streak-notifications-bridge" />,
}));

vi.mock('@ui/topbars/shared/TopbarShared', () => ({
  default: () => <div data-testid="topbar-shared" />,
}));

vi.mock('@ui/menus/sidebar-search-trigger/SidebarSearchTrigger', () => ({
  default: ({ onClick }: { onClick?: () => void }) => (
    <button
      type="button"
      data-testid="sidebar-search-trigger"
      onClick={onClick}
    >
      sidebar-search-trigger
    </button>
  ),
}));

vi.mock('@app-config/menu-items.config', () => ({
  APP_LOGO_HREF: '/workspace/overview',
  APP_MENU_ITEMS: [{ href: '/workspace', label: 'Workspace' }],
  APP_SECONDARY_MENU_ITEMS: [
    { href: '/workspace/activity', label: 'Activity' },
  ],
  getAppSecondaryMenuItems: (brandId?: string | null) =>
    brandId
      ? [
          { href: '/workspace/activity', label: 'Activity' },
          { href: `/settings/brands/${brandId}`, label: 'Settings' },
        ]
      : [{ href: '/workspace/activity', label: 'Activity' }],
  POSTS_INSERT_AFTER_LABEL: 'Posts',
}));

vi.mock('@contexts/features/command-palette.context', () => ({
  CommandPaletteProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: mockBrandState.brandId,
  }),
}));

vi.mock('@services/core/command-palette.service', () => ({
  CommandPaletteService: {
    executeCommand: vi.fn(),
    getAllCommands: vi.fn(() => []),
    getRecentCommands: vi.fn(() => []),
    registerCommand: vi.fn(),
    registerCommands: vi.fn(),
    searchCommands: vi.fn(() => []),
    unregisterCommand: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@genfeedai/agent', () => ({
  AGENT_PANEL_OPEN_KEY: 'genfeed:agent-open',
  AgentApiService: class AgentApiService {},
  AgentPanel: (props: { isActive?: boolean }) => {
    agentPanelSpy(props);
    return (
      <div
        data-testid="agent-panel"
        data-is-active={String(props.isActive)}
        data-prompt-layout-mode="surface-fixed"
      />
    );
  },
  AgentThreadList: (props: {
    onActionsChange?: (actions: ReactNode) => void;
  }) => {
    useEffect(() => {
      props.onActionsChange?.(
        <button type="button">Conversation header action</button>,
      );

      return () => props.onActionsChange?.(null);
    }, [props.onActionsChange]);

    return <div data-testid="agent-thread-list" />;
  },
  useAgentChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      beginOverlaySession: beginOverlaySessionSpy,
      endOverlaySession: endOverlaySessionSpy,
      isOpen: false,
      setIsOpen: setIsOpenSpy,
      threads: [],
      toggleOpen: toggleOpenSpy,
    }),
  useAgentPageContext: vi.fn(),
}));

vi.mock('@hooks/auth/use-is-super-admin/use-is-super-admin', () => ({
  useIsSuperAdmin: () => false,
}));

vi.mock('@hooks/auth/use-user-role', () => ({
  useUserRole: () => 'member',
}));

vi.mock(
  '@hooks/commands/use-agent-thread-commands/use-agent-thread-commands',
  () => ({
    useAgentThreadCommands: vi.fn(),
  }),
);

vi.mock('@hooks/ui/use-menu-items', () => ({
  useMenuItems: () => [{ href: '/workspace', label: 'Workspace' }],
}));

vi.mock(
  '@hooks/data/organization/use-enabled-categories/use-enabled-categories',
  () => ({
    STUDIO_CATEGORY_CONFIG: [
      {
        category: 'image',
        param: 'image',
        settingKey: 'isGenerateImagesEnabled',
      },
      {
        category: 'video',
        param: 'video',
        settingKey: 'isGenerateVideosEnabled',
      },
      {
        category: 'music',
        param: 'music',
        settingKey: 'isGenerateMusicEnabled',
      },
      { category: 'avatar', param: 'avatar', settingKey: null },
    ],
    useEnabledCategories: () => enabledCategoriesState,
  }),
);

vi.mock('@hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: () => true,
}));

vi.mock('@pages/studio/sidebar/StudioSidebarContent', () => ({
  StudioSidebarContent: () => <div data-testid="studio-sidebar-content" />,
}));

vi.mock('@providers/protected-providers/protected-providers', () => ({
  default: ({
    children,
    ...props
  }: {
    children: ReactNode;
    includeAssetSelectionProvider?: boolean;
    includeElementsProvider?: boolean;
    includePromptBarProvider?: boolean;
  }) => {
    protectedProvidersSpy(props);
    return <>{children}</>;
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      admin: 'https://admin.genfeed.ai',
    },
  },
}));

vi.mock('@ui/banners/low-credits/LowCreditsBanner', () => ({
  default: () => {
    lowCreditsBannerSpy();
    return <div data-testid="low-credits-banner" />;
  },
}));

vi.mock('@ui/guards/onboarding/OnboardingGuard', () => ({
  default: ({ children }: { children: ReactNode }) => {
    onboardingGuardSpy();
    return <>{children}</>;
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@services/core/agent-overlay-coordination.service', async () => {
  const actual = await vi.importActual<
    typeof import('@services/core/agent-overlay-coordination.service')
  >('@services/core/agent-overlay-coordination.service');

  return {
    ...actual,
    dispatchAgentPanelStateChanged: vi.fn(),
    isDesktopAgentViewport: vi.fn(() => true),
  };
});

describe('AppProtectedLayout', () => {
  beforeEach(() => {
    mockPathname.value = '/workspace';
    mockBrandState.brandId = 'brand-123';
    enabledCategoriesState.enabledCategories = ['image', 'video', 'avatar'];
    enabledCategoriesState.isLoading = false;
    appLayoutSpy.mockClear();
    appSidebarSpy.mockClear();
    beginOverlaySessionSpy.mockClear();
    endOverlaySessionSpy.mockClear();
    agentPanelSpy.mockClear();
    onboardingGuardSpy.mockClear();
    lowCreditsBannerSpy.mockClear();
    protectedProvidersSpy.mockClear();
    setIsOpenSpy.mockClear();
    toggleOpenSpy.mockClear();

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        clear: vi.fn(),
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    });
  });

  it('hides the shell low credits banner on promptbar routes', () => {
    mockPathname.value = '/studio/video';
    render(<AppProtectedLayout />);
    expect(lowCreditsBannerSpy).not.toHaveBeenCalled();
  });

  it('keeps the shell low credits banner on editor routes', () => {
    mockPathname.value = '/editor/new';
    render(<AppProtectedLayout />);
    expect(lowCreditsBannerSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the shell low credits banner on non-promptbar routes', () => {
    mockPathname.value = '/workspace';
    render(<AppProtectedLayout />);
    expect(lowCreditsBannerSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('low-credits-banner')).toBeInTheDocument();
  });

  it('wires transparent shell chrome through the protected app shell', () => {
    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bannerComponent: expect.anything(),
        hasSecondaryTopbar: false,
        shellChromeVariant: 'transparent',
        topbarChromeVariant: 'default',
      }),
    );
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        collapsedSidebarWidth: 64,
        mobileSidebarWidth: 304,
        primaryAction: expect.objectContaining({
          href: '/workspace/overview#new-task',
          label: 'New Task',
        }),
        secondaryItems: [
          { href: '/workspace/activity', label: 'Activity' },
          {
            href: '/settings/brands/brand-123',
            label: 'Settings',
          },
        ],
        shellChromeVariant: 'transparent',
        shellMode: 'workspace',
        showOrganizationSwitcher: true,
        sidebarWidth: 304,
      }),
    );
    expect(onboardingGuardSpy).toHaveBeenCalled();
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-panel-rail')).toBeInTheDocument();
    expect(screen.getByTestId('agent-panel')).toBeInTheDocument();
  });

  it('enables topbar chrome for Studio routes', () => {
    mockPathname.value = '/studio/image';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bannerComponent: expect.anything(),
        hasSecondaryTopbar: true,
        topbarChromeVariant: 'default',
      }),
    );
  });

  it('keeps shared shell chrome on standard chat workspace routes', async () => {
    mockPathname.value = '/chat/new';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bannerComponent: expect.anything(),
        hasSecondaryTopbar: false,
        topbarChromeVariant: 'default',
        topbarComponent: expect.any(Function),
      }),
    );
    expect(await screen.findByTestId('agent-thread-list')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
  });

  it('renders a focused chat sidebar instead of the workspace navigation', () => {
    mockPathname.value = '/chat/new';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(
      screen.queryByTestId('sidebar-search-trigger'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to Workspace' }),
    ).toHaveAttribute('href', '/workspace/overview');
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        renderBody: expect.any(Function),
        shellMode: 'default',
        showOrganizationSwitcher: false,
        showPrimaryItems: false,
      }),
    );
  });

  it('passes conversation header actions through to the focused chat sidebar', () => {
    mockPathname.value = '/chat/new';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(
      screen.getByRole('button', { name: 'Conversation header action' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('conversation-actions-slot'),
    ).not.toBeInTheDocument();
  });

  it('hides sidebar and topbar chrome for focused onboarding chat routes', () => {
    mockPathname.value = '/chat/onboarding';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('streak-notifications-bridge'),
    ).not.toBeInTheDocument();
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bannerComponent: expect.anything(),
        topbarComponent: undefined,
      }),
    );
  });

  it('mounts the embedded agent rail outside /chat routes', () => {
    mockPathname.value = '/workspace';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(screen.getByTestId('agent-panel-rail')).toBeInTheDocument();
    expect(screen.getByTestId('agent-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
  });

  it('disables prompt bar and elements providers on workspace home routes', () => {
    mockPathname.value = '/workspace';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(protectedProvidersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        includeApiStatusCheck: false,
        includeElementsProvider: false,
        includePromptBarProvider: false,
      }),
    );
  });

  it('keeps the mixed agent sidebar on workflow routes outside editor canvases', () => {
    mockPathname.value = '/workflows';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        shellChromeVariant: 'transparent',
      }),
    );
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
  });

  it('renders a dedicated studio sidebar on studio routes outside editor canvases', () => {
    mockPathname.value = '/studio/image';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        backHref: '/library/ingredients',
        backLabel: 'Library',
        sectionLabel: 'Studio',
        shellChromeVariant: 'transparent',
      }),
    );
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
  });

  it('filters disabled studio categories from the dedicated studio sidebar', () => {
    mockPathname.value = '/studio/image';
    enabledCategoriesState.enabledCategories = ['image', 'video', 'avatar'];

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.not.arrayContaining([
          expect.objectContaining({
            href: '/studio/music',
            label: 'Music',
          }),
        ]),
      }),
    );
  });

  it('keeps chat-specific navigation out of the base sidebar menu items', () => {
    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.not.arrayContaining([
          expect.objectContaining({
            href: '/chat',
            label: 'Conversations',
          }),
        ]),
      }),
    );
  });

  it('syncs overlay visibility events for the embedded workspace rail', () => {
    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    window.dispatchEvent(
      new CustomEvent(ENTITY_OVERLAY_OPENED_EVENT, {
        detail: { overlayId: 'ingredient-overlay' },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(ENTITY_OVERLAY_CLOSED_EVENT, {
        detail: { overlayId: 'ingredient-overlay' },
      }),
    );

    expect(beginOverlaySessionSpy).toHaveBeenCalledWith('ingredient-overlay');
    expect(endOverlaySessionSpy).toHaveBeenCalledWith('ingredient-overlay');
  });

  it('skips editor-only providers and streak bridge on editor canvas routes', () => {
    mockPathname.value = '/editor/new';

    render(
      <AppProtectedLayout>
        <div>Editor canvas</div>
      </AppProtectedLayout>,
    );

    expect(protectedProvidersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        includeAssetSelectionProvider: false,
        includeElementsProvider: false,
        includePromptBarProvider: false,
      }),
    );
    expect(appLayoutSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('streak-notifications-bridge'),
    ).not.toBeInTheDocument();
  });

  it('keeps workflow editor detail routes outside the generic app shell', () => {
    mockPathname.value = '/workflows/workflow-123';

    render(
      <AppProtectedLayout>
        <div>Workflow editor</div>
      </AppProtectedLayout>,
    );

    expect(appLayoutSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Workflow editor')).toBeInTheDocument();
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
  });
});
