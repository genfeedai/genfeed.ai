import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppProtectedLayoutSidebar from './AppProtectedLayoutSidebar';
import AppProtectedLayout from './app-protected-layout';

const {
  appLayoutSpy,
  appSidebarSpy,
  agentThreadListSpy,
  commandPaletteOpenSpy,
  dispatchOpenTaskComposerSpy,
  shellState,
  onboardingGuardSpy,
  lowCreditsBannerSpy,
  protectedProvidersSpy,
  universalShellSpy,
} = vi.hoisted(() => ({
  agentThreadListSpy: vi.fn(),
  appLayoutSpy: vi.fn(),
  appSidebarSpy: vi.fn(),
  commandPaletteOpenSpy: vi.fn(),
  dispatchOpenTaskComposerSpy: vi.fn(),
  shellState: { shellThrows: false },
  lowCreditsBannerSpy: vi.fn(),
  onboardingGuardSpy: vi.fn(),
  protectedProvidersSpy: vi.fn(),
  universalShellSpy: vi.fn(),
}));

const mockPathname = vi.hoisted(() => ({
  value: '/workspace',
}));

const mockBrandState = vi.hoisted(() => ({
  brandId: 'brand-123',
}));

const mockRouteParams = vi.hoisted(() => ({
  brandSlug: 'brand-123',
  orgSlug: 'org-123',
}));
const originalLocation = window.location;

// Stable router instance (matches Next's real App Router, which returns the
// same object across renders). A fresh `push` per render would cascade through
// the hook's `useCallback` deps and remount the conversation subtree each
// render — turning the chat sidebar into an infinite mount loop.
const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

const enabledCategoriesState = vi.hoisted(() => ({
  enabledCategories: ['image', 'video', 'avatar'],
  isLoading: false,
}));

vi.mock('@genfeedai/auth-client/react', () => ({
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
    appLayoutSpy({ agentPanel, bannerComponent, ...props });
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
    isCollapsed?: boolean;
    shellChromeVariant?: 'default' | 'transparent';
    items?: { href: string; hrefScope?: string; label: string }[];
    logoHref?: string;
    mobileSidebarWidth?: number;
    onToggleCollapse?: () => void;
    orgSwitcherSlot?: ReactNode;
    primaryAction?:
      | { href: string; label: string }
      | { onClick: () => void; label: string };
    secondaryItems?: { href: string; label: string }[];
    renderBody?: () => ReactNode;
    renderAfterNavigation?: () => ReactNode;
    renderTopSlot?: () => ReactNode;
    sectionLabel?: string;
    shellMode?: 'default' | 'workspace';
    showPrimaryItems?: boolean;
    showUserProfile?: boolean;
    sidebarWidth?: number;
    backHref?: string;
    backLabel?: string;
  }) => {
    appSidebarSpy(props);
    return (
      <div data-testid="app-sidebar">
        {props.orgSwitcherSlot ? (
          <div data-testid="app-sidebar-org-switcher-slot">
            {props.orgSwitcherSlot}
          </div>
        ) : null}
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
      aria-label="Search"
      onClick={onClick}
    >
      Search
    </button>
  ),
}));

vi.mock('@ui/menus/sidebar-action-trigger/SidebarActionTrigger', () => ({
  default: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@ui/menus/switchers/MenuBrandSwitcher', () => ({
  default: ({ variant }: { variant?: string }) => (
    <div data-testid="sidebar-brand-switcher">{variant}</div>
  ),
}));

vi.mock('@ui/menus/organization-switcher/OrganizationSwitcher', () => ({
  default: ({ subscriptionTier }: { subscriptionTier?: string | null }) => (
    <div
      data-testid="organization-switcher"
      data-subscription-tier={subscriptionTier ?? ''}
    />
  ),
}));

vi.mock('@app-config/menu-items.config', () => ({
  APP_LOGO_HREF: '/workspace/overview',
  APP_MENU_ITEMS: [{ href: '/workspace', label: 'Workspace' }],
  APP_SECONDARY_MENU_ITEMS: [
    { href: '/workspace/activity', label: 'Activity' },
  ],
  getAppSecondaryMenuItems: (brandSlug?: string | null) =>
    brandSlug
      ? [
          { href: '/workspace/activity', label: 'Activity' },
          { href: '/settings', hrefScope: 'brand', label: 'Settings' },
        ]
      : [{ href: '/workspace/activity', label: 'Activity' }],
  POSTS_INSERT_AFTER_LABEL: 'Posts',
}));

vi.mock('@app-config/research-menu-items.config', () => ({
  RESEARCH_LOGO_HREF: '/research/discovery',
  RESEARCH_MENU_ITEMS: [
    { href: '/research/discovery', label: 'Discovery' },
    { href: '/research/socials', label: 'Socials' },
    { href: '/research/ads', label: 'Ads' },
  ],
}));

vi.mock('@contexts/features/command-palette.provider', () => ({
  CommandPaletteProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: mockBrandState.brandId,
    brands: [
      {
        id: mockBrandState.brandId,
        label: 'Moonrise Studio',
        organization: { id: 'org-123', slug: 'org-123' },
        slug: 'brand-123',
      },
    ],
    selectedBrand: {
      id: mockBrandState.brandId,
      label: 'Moonrise Studio',
      organization: { id: 'org-123', slug: 'org-123' },
      slug: 'brand-123',
    },
    setBrandId: vi.fn(),
    setOrganizationId: vi.fn(),
    settings: { subscriptionTier: 'scale' },
  }),
}));

vi.mock('@services/core/command-palette.service', () => ({
  CommandPaletteService: {
    executeCommand: vi.fn(),
    getAllCommands: vi.fn(() => []),
    getRecentCommands: vi.fn(() => []),
    registerCommand: vi.fn(),
    registerCommands: vi.fn((commands: { id: string }[]): string[] =>
      commands.map((command) => command.id),
    ),
    searchCommands: vi.fn(() => []),
    unregisterCommand: vi.fn(),
    unregisterCommands: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/workspace/task-composer-events', () => ({
  dispatchOpenTaskComposer: dispatchOpenTaskComposerSpy,
}));

vi.mock('@/store/commandPaletteStore', () => ({
  useCommandPaletteStore: {
    getState: () => ({
      open: commandPaletteOpenSpy,
    }),
  },
}));

// Render `next/dynamic` lazy boundaries synchronously (repo-wide test
// convention). The real next/dynamic resolves via React.lazy/Suspense, which —
// once the `@genfeedai/agent` module is warm from an earlier render and the
// boundary is awaited through `findBy*` (waitFor + act) — re-suspends in an
// unbounded loop that exhausts the heap and OOMs the shard worker. Resolving
// the loader's target synchronously by export name removes the async path
// entirely while preserving the rendered stubs and their spies.
vi.mock('next/dynamic', () => ({
  default: (
    loader: () => Promise<unknown>,
    options?: { loading?: () => ReactNode },
  ) => {
    const source = String(loader);

    if (source.includes('AgentThreadList')) {
      return function LazyAgentThreadListStub(props: {
        onActionsChange?: (actions: ReactNode) => void;
      }) {
        agentThreadListSpy(props);
        useEffect(() => {
          props.onActionsChange?.(
            <button type="button">Conversation header action</button>,
          );

          return () => props.onActionsChange?.(null);
        }, [props.onActionsChange]);

        return <div data-testid="agent-thread-list" />;
      };
    }

    if (source.includes('UniversalWorkspaceShell')) {
      return function LazyUniversalWorkspaceShellStub({
        children,
      }: {
        children: ReactNode;
      }) {
        universalShellSpy();
        if (shellState.shellThrows) {
          throw new Error('workspace shell render failed');
        }
        return <div data-testid="universal-workspace-shell">{children}</div>;
      };
    }

    if (source.includes('CommandPalette')) {
      return function LazyCommandPaletteStub() {
        return <div data-testid="command-palette" />;
      };
    }

    return options?.loading ?? (() => null);
  },
}));

vi.mock('@genfeedai/agent', () => ({
  AgentApiService: class AgentApiService {},
  useAgentChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      threads: [],
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

vi.mock('@genfeedai/config/license', () => ({
  isEEEnabled: () => true,
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: () => process.env.NEXT_PUBLIC_DESKTOP_SHELL?.trim() === '1',
  isSaaS: () => {
    const cloudFlag = process.env.NEXT_PUBLIC_GENFEED_CLOUD?.trim();

    return (
      (cloudFlag === '1' || cloudFlag?.toLowerCase() === 'true') &&
      process.env.NEXT_PUBLIC_DESKTOP_SHELL?.trim() !== '1'
    );
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

// AssetGateGuard reads useAccessState/useOrgUrl; this suite mocks ProtectedProviders
// down to bare children (no AccessStateProvider), so pass children through here.
vi.mock('./asset-gate-guard', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  useParams: () => mockRouteParams,
  usePathname: () => mockPathname.value,
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@services/core/agent-overlay-coordination.service', async () => {
  const actual = await vi.importActual<
    typeof import('@services/core/agent-overlay-coordination.service')
  >('@services/core/agent-overlay-coordination.service');

  return {
    ...actual,
    isDesktopAgentViewport: vi.fn(() => true),
  };
});

describe('AppProtectedLayout', () => {
  beforeEach(() => {
    mockPathname.value = '/workspace';
    shellState.shellThrows = false;
    sessionStorage.clear();
    mockBrandState.brandId = 'brand-123';
    mockRouteParams.brandSlug = 'brand-123';
    mockRouteParams.orgSlug = 'org-123';
    enabledCategoriesState.enabledCategories = ['image', 'video', 'avatar'];
    enabledCategoriesState.isLoading = false;
    appLayoutSpy.mockClear();
    appSidebarSpy.mockClear();
    agentThreadListSpy.mockClear();
    commandPaletteOpenSpy.mockClear();
    dispatchOpenTaskComposerSpy.mockClear();
    onboardingGuardSpy.mockClear();
    lowCreditsBannerSpy.mockClear();
    protectedProvidersSpy.mockClear();
    universalShellSpy.mockClear();
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'localhost' },
      writable: true,
    });

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

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
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

  it('wires the agent-first shell through the protected app shell', async () => {
    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(
      screen.queryByTestId('sidebar-brand-switcher'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('organization-switcher')).toBeInTheDocument();
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bannerComponent: expect.anything(),
        hasSecondaryTopbar: false,
        shellChromeVariant: 'default',
        topbarChromeVariant: 'default',
      }),
    );
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        collapsedSidebarWidth: 0,
        currentApp: 'workspace',
        mobileSidebarWidth: 304,
        orgSwitcherSlot: expect.anything(),
        renderTopSlot: expect.any(Function),
        secondaryItems: [
          { href: '/workspace/activity', label: 'Activity' },
          {
            href: '/settings',
            hrefScope: 'brand',
            label: 'Settings',
          },
        ],
        shellChromeVariant: 'default',
        shellMode: 'workspace',
        sidebarWidth: 304,
      }),
    );
    expect(onboardingGuardSpy).toHaveBeenCalled();
    expect(await screen.findByTestId('agent-thread-list')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel-rail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
  });

  it('keeps the org switcher visible in SaaS mode', () => {
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(screen.getByTestId('organization-switcher')).toBeInTheDocument();
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({ orgSwitcherSlot: expect.anything() }),
    );
  });

  it('renders the workspace quick actions in the sidebar top slot', () => {
    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    const newTaskButton = screen.getByRole('button', { name: 'New Task' });
    const searchButton = screen.getByRole('button', { name: 'Search' });

    expect(newTaskButton).toBeInTheDocument();
    expect(searchButton).toBeInTheDocument();
    expect(
      newTaskButton.compareDocumentPosition(searchButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('opens the command palette from the workspace sidebar action', () => {
    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(commandPaletteOpenSpy).toHaveBeenCalledTimes(1);
  });

  it('opens the task composer from the workspace sidebar action', () => {
    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'New Task' }));

    expect(dispatchOpenTaskComposerSpy).toHaveBeenCalledTimes(1);
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

  it('mounts the universal shell without the legacy terminal dock', async () => {
    mockPathname.value = '/org-123/brand-123/studio/image';

    render(
      <AppProtectedLayout>
        <div>Canonical studio content</div>
      </AppProtectedLayout>,
    );

    expect(screen.getByTestId('universal-workspace-shell')).toBeInTheDocument();
    expect(screen.getByText('Canonical studio content')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    expect(await screen.findByTestId('agent-thread-list')).toBeInTheDocument();
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isWorkspaceShell: true }),
    );
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        renderBody: expect.any(Function),
        shellMode: 'default',
        showPrimaryItems: false,
      }),
    );
  });

  it('keeps render failures inside the agent-first error boundary', () => {
    shellState.shellThrows = true;
    mockPathname.value = '/org-123/brand-123/studio/image';
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const view = render(
      <AppProtectedLayout>
        <div>Canonical studio content</div>
      </AppProtectedLayout>,
    );

    expect(screen.queryByText('Canonical studio content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('universal-workspace-shell'),
    ).not.toBeInTheDocument();
    const shellAttemptsAfterFailure = universalShellSpy.mock.calls.length;
    shellState.shellThrows = false;
    view.unmount();
    render(
      <AppProtectedLayout>
        <div>Canonical studio content</div>
      </AppProtectedLayout>,
    );

    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('universal-workspace-shell')).toBeInTheDocument();
    expect(universalShellSpy).toHaveBeenCalledTimes(shellAttemptsAfterFailure + 1);
    consoleError.mockRestore();
  });

  it('keeps shared shell chrome on standard agent workspace routes', async () => {
    mockPathname.value = '/agent/new';

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

  it('renders a focused agent sidebar instead of the workspace navigation', () => {
    mockPathname.value = '/agent/new';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(
      screen.queryByTestId('sidebar-search-trigger'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Back to Workspace' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        renderBody: expect.any(Function),
        shellMode: 'default',
        showPrimaryItems: false,
      }),
    );
  });

  it('passes conversation header actions through to the focused agent sidebar', () => {
    mockPathname.value = '/agent/new';

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

  it('marks the focused agent route as the Agent app', async () => {
    mockPathname.value = '/agent/new';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(await screen.findByTestId('agent-thread-list')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'agent',
      }),
    );
  });

  it.each([
    ['/workspace/overview', 'Workspace'],
    ['/studio/image', 'Image'],
    ['/library/images', 'Images'],
    ['/research/discovery', 'Discovery'],
    ['/analytics/overview', 'Overview'],
    ['/workflows/executions', 'Runs'],
    ['/admin', 'Dashboard'],
    ['/agent/new', 'New conversation'],
  ])('feeds the active surface navigation to breadcrumbs on %s', (pathname, expectedLabel) => {
    mockPathname.value = pathname;

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    const layoutProps = appLayoutSpy.mock.lastCall?.[0] as {
      menuItems?: { label: string }[];
    };
    expect(layoutProps.menuItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: expectedLabel }),
      ]),
    );
  });

  it.each([
    ['/org-123/~/settings/api-keys', 'Settings', 'API Keys'],
    ['/org-123/brand-123/research/following', 'Research', 'Following'],
    ['/org-123/brand-123/library/ingredients', 'Library', 'Ingredients'],
    ['/org-123/brand-123/library/moodboard', 'Library', 'Moodboard'],
    ['/org-123/brand-123/studio/clips', 'Studio', 'Clips'],
    ['/org-123/brand-123/analytics/trends', 'Analytics', 'Trends'],
    [
      '/org-123/brand-123/analytics/trends/detail/trend-1',
      'Analytics',
      'Trend Detail',
    ],
    ['/org-123/brand-123/workflows/templates', 'Workflows', 'Templates'],
    ['/org-123/brand-123/workflows/new', 'Workflows', 'New Workflow'],
    [
      '/org-123/brand-123/orchestration/content-runs/run-1',
      'Workflows',
      'Content Run',
    ],
    [
      '/org-123/brand-123/orchestration/campaigns/campaign-1',
      'Workflows',
      'Campaign',
    ],
  ] as const)('feeds canonical root and leaf breadcrumb metadata on %s', (pathname, rootLabel, leafLabel) => {
    mockPathname.value = pathname;

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    const layoutProps = appLayoutSpy.mock.lastCall?.[0] as {
      breadcrumb?: { leafLabel: string; rootLabel: string };
    };
    expect(layoutProps.breadcrumb).toEqual({ leafLabel, rootLabel });
  });

  it('hides sidebar and topbar chrome for focused onboarding agent routes', () => {
    mockPathname.value = '/agent/onboarding';

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

  it('does not mount the legacy embedded agent rail', async () => {
    mockPathname.value = '/workspace';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(screen.queryByTestId('agent-panel-rail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    expect(await screen.findByTestId('agent-thread-list')).toBeInTheDocument();
  });

  it('hides the terminal dock on hosted cloud', () => {
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    mockPathname.value = '/workspace';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(screen.queryByTestId('agent-panel-rail')).not.toBeInTheDocument();
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPanel: undefined,
        onAgentToggle: undefined,
      }),
    );
  });

  it('does not restore the terminal dock from the hosted app hostname', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'app.genfeed.ai' },
      writable: true,
    });
    mockPathname.value = '/workspace';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(screen.queryByTestId('agent-panel-rail')).not.toBeInTheDocument();
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

  it('passes the Workspace section header to the base workspace sidebar', () => {
    mockPathname.value = '/workspace';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'workspace',
        sectionLabel: 'Workspace',
        shellMode: 'workspace',
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
        shellChromeVariant: 'default',
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
        sectionLabel: 'Studio',
        shellChromeVariant: 'default',
      }),
    );
    expect(appSidebarSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty('backHref');
    expect(appSidebarSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'backLabel',
    );
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
  });

  it.each([
    ['/studio/image', 'studio', 'Studio'],
    ['/library/ingredients', 'library', 'Library'],
    ['/analytics/overview', 'analytics', 'Analytics'],
    ['/workflows', 'workflows', 'Workflows'],
  ])('does not render a Workspace back row for the %s app-switcher surface', (pathname, currentApp, sectionLabel) => {
    mockPathname.value = pathname;

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    const sidebarProps = appSidebarSpy.mock.calls.at(-1)?.[0];

    expect(sidebarProps).toEqual(
      expect.objectContaining({
        currentApp,
        sectionLabel,
        shellChromeVariant: 'default',
      }),
    );
    expect(sidebarProps).not.toHaveProperty('backHref');
    expect(sidebarProps).not.toHaveProperty('backLabel');
    expect(
      screen.queryByRole('link', { name: 'Back to Workspace' }),
    ).not.toBeInTheDocument();
  });

  it('renders admin navigation through the shared app sidebar shell', () => {
    mockPathname.value = '/admin';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        logoHref: '/admin',
        showUserProfile: true,
        items: expect.arrayContaining([
          expect.objectContaining({
            href: '/admin/agent',
            hrefScope: 'global',
            label: 'Agent',
          }),
        ]),
      }),
    );
  });

  it('forwards collapse controls into the dedicated Library sidebar', () => {
    const onToggleCollapse = vi.fn();

    render(
      <AppProtectedLayoutSidebar
        shellChromeVariant="default"
        taskContextSearchParams={new URLSearchParams()}
        currentApp="library"
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
        isAdminRoute={false}
        isAnalyticsRoute={false}
        isComposeRoute={false}
        isConversationRoute={false}
        isEditorRoute={false}
        isFocusedOnboardingRoute={false}
        isLibraryRoute
        isOrgRoute={false}
        isResearchRoute={false}
        isSettingsRoute={false}
        isStudioRoute={false}
        isWorkflowsRoute={false}
        adminMenuItems={[]}
        analyticsMenuItems={[]}
        composeMenuItems={[]}
        libraryMenuItems={[{ href: '/library/images', label: 'Images' }]}
        menuItems={[]}
        orgMenuItems={[]}
        researchMenuItems={[]}
        secondaryMenuItems={[]}
        settingsMenuItems={[]}
        studioMenuItems={[]}
        workflowsMenuItems={[]}
        conversationActions={null}
        renderConversations={() => null}
        onOpenCommandPalette={vi.fn()}
      />,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'library',
        isCollapsed: false,
        onToggleCollapse,
        sectionLabel: 'Library',
      }),
    );
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

  it('renders a dedicated research sidebar on research routes', () => {
    mockPathname.value = '/research/discovery';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'research',
        items: [
          { href: '/research/discovery', label: 'Discovery' },
          { href: '/research/socials', label: 'Socials' },
          { href: '/research/ads', label: 'Ads' },
        ],
        sectionLabel: 'Research',
        shellChromeVariant: 'default',
      }),
    );
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.not.arrayContaining([
          expect.objectContaining({
            href: '/workspace',
            label: 'Workspace',
          }),
        ]),
      }),
    );
  });

  it('keeps agent-specific navigation out of the base sidebar menu items', () => {
    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.not.arrayContaining([
          expect.objectContaining({
            href: '/agent',
            label: 'Conversations',
          }),
        ]),
      }),
    );
  });

  it('keeps editor routes inside the agent-first shell while skipping editor-only providers', async () => {
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
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isWorkspaceShell: true }),
    );
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(await screen.findByTestId('agent-thread-list')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('streak-notifications-bridge'),
    ).not.toBeInTheDocument();
  });

  it('keeps workflow editor detail routes inside the agent-first shell', async () => {
    mockPathname.value = '/workflows/workflow-123';

    render(
      <AppProtectedLayout>
        <div>Workflow editor</div>
      </AppProtectedLayout>,
    );

    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isWorkspaceShell: true }),
    );
    expect(screen.getByText('Workflow editor')).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(await screen.findByTestId('agent-thread-list')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
  });
});
