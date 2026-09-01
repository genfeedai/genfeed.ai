import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppProtectedLayoutSidebar from './AppProtectedLayoutSidebar';
import AppProtectedLayout from './app-protected-layout';

const {
  appLayoutSpy,
  appSidebarSpy,
  agentThreadListSpy,
  captureAnalyticsPageviewSpy,
  commandPaletteOpenSpy,
  clearAnalyticsOrganizationSpy,
  dispatchOpenTaskComposerSpy,
  identifyAnalyticsOrganizationSpy,
  identifyAnalyticsUserSpy,
  shellState,
  onboardingGuardSpy,
  lowCreditsBannerSpy,
  protectedProvidersSpy,
  resetAnalyticsSpy,
  universalShellSpy,
} = vi.hoisted(() => ({
  agentThreadListSpy: vi.fn(),
  appLayoutSpy: vi.fn(),
  appSidebarSpy: vi.fn(),
  captureAnalyticsPageviewSpy: vi.fn(),
  commandPaletteOpenSpy: vi.fn(),
  clearAnalyticsOrganizationSpy: vi.fn(),
  dispatchOpenTaskComposerSpy: vi.fn(),
  identifyAnalyticsOrganizationSpy: vi.fn(),
  identifyAnalyticsUserSpy: vi.fn(),
  shellState: { isAuthLoaded: true, isShellThrowing: false },
  lowCreditsBannerSpy: vi.fn(),
  onboardingGuardSpy: vi.fn(),
  protectedProvidersSpy: vi.fn(),
  resetAnalyticsSpy: vi.fn(),
  universalShellSpy: vi.fn(),
}));

const mockPathname = vi.hoisted(() => ({
  value: '/workspace',
}));

const mockBrandState = vi.hoisted(() => ({
  brandId: 'brand-123',
  organizationId: 'org-123',
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

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue('token'),
  }),
}));

vi.mock('@hooks/auth/use-auth-user', () => ({
  useAuthUser: () => ({
    isLoaded: true,
    user: {
      id: 'user-123',
      primaryEmailAddress: { emailAddress: 'user@example.com' },
    },
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

vi.mock(
  '@app/(protected)/[orgSlug]/[brandSlug]/library/library-sidebar-nav',
  () => ({
    default: () => <div data-testid="library-sidebar-nav">Library nav</div>,
  }),
);

vi.mock('@ui/layouts/app/AppLayout', () => ({
  default: ({
    bannerComponent,
    children,
    menuComponent,
    renderBody,
    ...props
  }: {
    bannerComponent?: ReactNode;
    children: ReactNode;
    menuComponent?: ReactNode;
    renderBody?: () => ReactNode;
  }) => {
    appLayoutSpy({ bannerComponent, ...props });
    return (
      <div data-testid="app-layout">
        {menuComponent}
        {bannerComponent}
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
    items?: { href: string; hrefScope?: string; label: string }[];
    mobileSidebarWidth?: number;
    orgSwitcherSlot?: ReactNode;
    primaryAction?:
      | { href: string; label: string }
      | { onClick: () => void; label: string };
    secondaryItems?: { href: string; label: string }[];
    renderBody?: () => ReactNode;
    renderAfterNavigation?: () => ReactNode;
    renderTopSlot?: () => ReactNode;
    sectionLabel?: string;
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

vi.mock('@app-components/settings-search/SettingsSearch', () => ({
  default: () => <div data-testid="settings-search" />,
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
  PUBLISHING_INSERT_AFTER_LABEL: 'Posts',
}));

vi.mock('@app-config/discovery-menu-items.config', () => ({
  DISCOVERY_MENU_ITEMS: [
    { href: '/discovery/overview', label: 'Overview' },
    { href: '/discovery/following', label: 'Following' },
    { href: '/discovery/ads', label: 'Ads' },
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
    isBrandScopeResolved: true,
    organizationId: mockBrandState.organizationId,
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

vi.mock('@/lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics')>();

  return {
    ...actual,
    captureAnalyticsPageview: captureAnalyticsPageviewSpy,
    clearAnalyticsOrganization: clearAnalyticsOrganizationSpy,
    identifyAnalyticsOrganization: identifyAnalyticsOrganizationSpy,
    identifyAnalyticsUser: identifyAnalyticsUserSpy,
    isAnalyticsEnabled: () => true,
    resetAnalytics: resetAnalyticsSpy,
  };
});

vi.mock('@services/core/command-palette.service', () => ({
  CommandPaletteService: {
    executeCommand: vi.fn(),
    getAllCommands: vi.fn(() => []),
    getRecentCommands: vi.fn(() => []),
    registerCommands: vi.fn((commands: { id: string }[]): string[] =>
      commands.map((item) => item.id),
    ),
    searchCommands: vi.fn(() => []),
    unregisterCommands: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
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
        resolveThreadHref?: (thread: {
          brandId?: string | null;
          id: string;
        }) => string;
        searchAction?: ReactNode;
        showTitle?: boolean;
      }) {
        agentThreadListSpy(props);
        // Header actions are owned by the list itself (no parent lift) so
        // nav-panel identity stays stable across thread switches.
        return (
          <div data-testid="agent-thread-list">
            {props.showTitle ? <span>Conversations</span> : null}
            <button type="button">Conversation header action</button>
            {props.searchAction}
          </div>
        );
      };
    }

    if (source.includes('UniversalWorkspaceShell')) {
      return function LazyUniversalWorkspaceShellStub({
        children,
      }: {
        children: ReactNode;
      }) {
        universalShellSpy();
        if (shellState.isShellThrowing) {
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

vi.mock('@/hooks/useOptionalAuth', () => ({
  useOptionalAuth: () => ({
    getToken: vi.fn().mockResolvedValue('token'),
    // Held open by a test that needs the pre-boot window: no auth means no
    // agent API service, which is the only thing that keeps the shell body from
    // mounting.
    isLoaded: shellState.isAuthLoaded,
    isSignedIn: shellState.isAuthLoaded,
  }),
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
  hasOrganizationBillingHint: () => true,
}));

vi.mock('@genfeedai/config/deployment', () => ({
  getClientSurface: () =>
    process.env.NEXT_PUBLIC_DESKTOP_SHELL?.trim() === '1' ? 'desktop' : 'web',
  getDeployment: () => {
    const cloudFlag = process.env.NEXT_PUBLIC_GENFEED_CLOUD?.trim();

    return cloudFlag === '1' || cloudFlag?.toLowerCase() === 'true'
      ? 'cloud'
      : 'self-hosted';
  },
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

// Mocked so this suite stays hermetic (the real banner reads the Better Auth
// session store); its own behavior is covered in impersonation-banner.test.tsx.
vi.mock('./impersonation-banner', () => ({
  default: () => <div data-testid="impersonation-banner" />,
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
    shellState.isAuthLoaded = true;
    shellState.isShellThrowing = false;
    sessionStorage.clear();
    mockBrandState.brandId = 'brand-123';
    mockBrandState.organizationId = 'org-123';
    mockRouteParams.brandSlug = 'brand-123';
    mockRouteParams.orgSlug = 'org-123';
    appLayoutSpy.mockClear();
    appSidebarSpy.mockClear();
    agentThreadListSpy.mockClear();
    captureAnalyticsPageviewSpy.mockClear();
    commandPaletteOpenSpy.mockClear();
    clearAnalyticsOrganizationSpy.mockClear();
    dispatchOpenTaskComposerSpy.mockClear();
    identifyAnalyticsOrganizationSpy.mockClear();
    identifyAnalyticsUserSpy.mockClear();
    onboardingGuardSpy.mockClear();
    lowCreditsBannerSpy.mockClear();
    protectedProvidersSpy.mockClear();
    resetAnalyticsSpy.mockClear();
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
    mockPathname.value = '/studio/storyboard';
    render(<AppProtectedLayout />);
    expect(lowCreditsBannerSpy).not.toHaveBeenCalled();
    // The impersonation banner has no route carve-outs: it must survive
    // every route the impersonated session can reach.
    expect(screen.getByTestId('impersonation-banner')).toBeInTheDocument();
  });

  it('keeps the shell low credits banner on the studio edit surface', () => {
    mockPathname.value = '/studio/edit/new';
    render(<AppProtectedLayout />);
    expect(lowCreditsBannerSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the shell low credits banner on non-promptbar routes', () => {
    mockPathname.value = '/workspace';
    render(<AppProtectedLayout />);
    expect(lowCreditsBannerSpy).toHaveBeenCalled();
    expect(screen.getByTestId('low-credits-banner')).toBeInTheDocument();
    expect(screen.getByTestId('impersonation-banner')).toBeInTheDocument();
  });

  it('wires the permanent workspace shell through the protected app shell', () => {
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
      }),
    );
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        collapsedSidebarWidth: 0,
        currentApp: 'workspace',
        orgSwitcherSlot: expect.anything(),
        renderTopSlot: expect.any(Function),
        sectionLabel: 'Workspace',
        showPrimaryItems: true,
      }),
    );
    expect(onboardingGuardSpy).toHaveBeenCalled();
    // The conversation is a surface at /agent and an inspector drawer
    // everywhere else — it no longer takes over the workspace nav column.
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
  });

  it('keeps product analytics grouped with the active organization', () => {
    const { rerender } = render(<AppProtectedLayout />);

    expect(identifyAnalyticsOrganizationSpy).toHaveBeenLastCalledWith(
      'org-123',
    );

    mockBrandState.organizationId = 'org-456';
    rerender(<AppProtectedLayout />);

    expect(identifyAnalyticsOrganizationSpy).toHaveBeenLastCalledWith(
      'org-456',
    );
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

  it('keeps the workspace quick actions on non-conversation routes', () => {
    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(
      screen.getByRole('button', { name: 'New Task' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /New Thread/ }),
    ).not.toBeInTheDocument();
  });

  it('hands the nav column to the conversation module on agent routes', () => {
    mockPathname.value = '/agent/new';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(
      screen.getByRole('link', { name: 'New agent thread' }),
    ).toHaveAttribute('href', '/org-123/brand-123/agent/new');
    expect(
      screen.getByRole('button', { name: 'Conversation header action' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New Task' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Search' }),
    ).not.toBeInTheDocument();

    const resolveThreadHref = agentThreadListSpy.mock.calls.at(-1)?.[0]
      ?.resolveThreadHref as
      | ((thread: { brandId?: string | null; id: string }) => string)
      | undefined;
    expect(resolveThreadHref).toEqual(expect.any(Function));
    expect(resolveThreadHref?.({ brandId: 'brand-123', id: 'thread-1' })).toBe(
      '/org-123/brand-123/agent/thread-1',
    );
    expect(resolveThreadHref?.({ brandId: null, id: 'thread-2' })).toBe(
      '/org-123/~/agent/thread-2',
    );
  });

  it('keeps the global new-task shortcut available in the agent-first shell', () => {
    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    fireEvent.keyDown(window, {
      key: 'n',
      metaKey: true,
      shiftKey: true,
    });

    expect(dispatchOpenTaskComposerSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the permanent topbar on Studio routes', () => {
    mockPathname.value = '/studio/storyboard';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bannerComponent: expect.anything(),
        topbarComponent: expect.any(Function),
      }),
    );
  });

  it('mounts the universal shell around canonical Studio content', () => {
    mockPathname.value = '/org-123/brand-123/studio/storyboard';

    render(
      <AppProtectedLayout>
        <div>Canonical studio content</div>
      </AppProtectedLayout>,
    );

    expect(screen.getByTestId('universal-workspace-shell')).toBeInTheDocument();
    expect(screen.getByText('Canonical studio content')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isWorkspaceShell: true }),
    );
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'studio',
        sectionLabel: 'Studio',
      }),
    );
  });

  it('keeps render failures inside the protected shell error boundary', () => {
    shellState.isShellThrowing = true;
    mockPathname.value = '/org-123/brand-123/studio/storyboard';
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const view = render(
      <AppProtectedLayout>
        <div>Canonical studio content</div>
      </AppProtectedLayout>,
    );

    expect(
      screen.queryByText('Canonical studio content'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('universal-workspace-shell'),
    ).not.toBeInTheDocument();
    const shellAttemptsAfterFailure = universalShellSpy.mock.calls.length;
    shellState.isShellThrowing = false;
    view.unmount();
    render(
      <AppProtectedLayout>
        <div>Canonical studio content</div>
      </AppProtectedLayout>,
    );

    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('universal-workspace-shell')).toBeInTheDocument();
    expect(universalShellSpy.mock.calls.length).toBeGreaterThan(
      shellAttemptsAfterFailure,
    );
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
        showPrimaryItems: false,
      }),
    );
  });

  it('keeps conversation header actions inside the agent sidebar list (no parent lift)', () => {
    mockPathname.value = '/agent/new';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(
      screen.getByRole('button', { name: 'Conversation header action' }),
    ).toBeInTheDocument();
    // Must not surface via the legacy AppSidebar conversationActions slot —
    // that lift recreated the nav panel and remounted the thread list.
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
    ['/workspace', 'Workspace'],
    ['/studio/storyboard', 'Storyboard'],
    ['/library/images', 'All assets'],
    ['/discovery/overview', 'Overview'],
    ['/analytics', 'Overview'],
    ['/automation/workflows/executions', 'Runs'],
    ['/admin', 'Dashboard'],
    ['/agent/new', 'New conversation'],
  ])(
    'feeds the active surface navigation to breadcrumbs on %s',
    (pathname, expectedLabel) => {
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
    },
  );

  it.each([
    ['/org-123/~/settings/api-keys', 'Settings', 'API Keys'],
    ['/org-123/brand-123/discovery/following', 'Discovery', 'Following'],
    ['/org-123/brand-123/library', 'Library', 'Overview'],
    ['/org-123/brand-123/library/videos', 'Library', 'Assets'],
    ['/org-123/brand-123/library/moodboard', 'Library', 'Moodboard'],
    ['/org-123/brand-123/studio/clips', 'Studio', 'Clips'],
    ['/org-123/brand-123/analytics/trends', 'Analytics', 'Trends'],
    [
      '/org-123/brand-123/analytics/trends/detail/trend-1',
      'Analytics',
      'Trend Detail',
    ],
    [
      '/org-123/brand-123/automation/workflows/templates',
      'Automation',
      'Templates',
    ],
    [
      '/org-123/brand-123/automation/workflows/new',
      'Automation',
      'New Workflow',
    ],
    [
      '/org-123/brand-123/automation/content-runs',
      'Automation',
      'Content Runs',
    ],
    [
      '/org-123/brand-123/automation/content-runs/run-1',
      'Automation',
      'Content Run',
    ],
    [
      '/org-123/brand-123/automation/campaigns/campaign-1',
      'Automation',
      'Program',
    ],
  ] as const)(
    'feeds canonical root and leaf breadcrumb metadata on %s',
    (pathname, rootLabel, leafLabel) => {
      mockPathname.value = pathname;

      render(
        <AppProtectedLayout>
          <div>Protected content</div>
        </AppProtectedLayout>,
      );

      const layoutProps = appLayoutSpy.mock.lastCall?.[0] as {
        breadcrumb?: { leafLabel: string; rootLabel: string };
      };
      expect(layoutProps.breadcrumb).toEqual({
        leafLabel,
        ...(pathname === '/org-123/~/settings/api-keys'
          ? { parentLabel: 'Org 123' }
          : {}),
        rootLabel,
      });
    },
  );

  it.each([
    '/org-123/brand-123/automation/workflows/new',
    '/org-123/brand-123/automation/workflows/wf-123',
    '/org-123/brand-123/studio/edit/new',
  ])('hides module sidebar on editor canvas route %s', (pathname) => {
    mockPathname.value = pathname;

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('streak-notifications-bridge'),
    ).not.toBeInTheDocument();
  });

  it('hides sidebar and topbar chrome for focused onboarding agent routes', () => {
    // Org-scoped on purpose: onboarding is a registered shell route, so this is
    // the one flow whose chrome the route itself has to suppress.
    mockPathname.value = '/org-123/brand-123/agent/onboarding';

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
    expect(protectedProvidersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        includeElementsProvider: false,
        includePromptBarProvider: false,
      }),
    );
  });

  it('disables catalog providers on org-empty focused onboarding routes', () => {
    mockPathname.value = '/org-123/~/agent/onboarding';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(protectedProvidersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        includeElementsProvider: false,
        includePromptBarProvider: false,
      }),
    );
  });

  it('keeps the topbar frame on a canvas route while the shell body is still booting', () => {
    // No auth yet means no agent API service, so the shell body cannot mount.
    // Canvas routes still own the left rail, while the application keeps the
    // shared topbar visible during this boot window.
    shellState.isAuthLoaded = false;
    mockPathname.value = '/org-123/brand-123/studio/edit/new';

    render(
      <AppProtectedLayout>
        <div>Editor canvas</div>
      </AppProtectedLayout>,
    );

    expect(
      screen.queryByTestId('universal-workspace-shell'),
    ).not.toBeInTheDocument();
    // The module sidebar is deliberately suppressed on canvas routes; the frame
    // that has to survive the booting window is the layout plus its topbar.
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isWorkspaceShell: false,
        topbarComponent: expect.any(Function),
      }),
    );
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

  it('uses the workspace navigation on the Workspace surface', () => {
    mockPathname.value = '/workspace';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'workspace',
        items: expect.arrayContaining([
          expect.objectContaining({ href: '/workspace', label: 'Workspace' }),
        ]),
        sectionLabel: 'Workspace',
        showPrimaryItems: true,
      }),
    );
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
  });

  it('keeps Messages module navigation while the page owns its mailbox list', () => {
    mockPathname.value = '/org-123/brand-123/messages';

    render(
      <AppProtectedLayout>
        <div>Messages canvas</div>
      </AppProtectedLayout>,
    );

    expect(screen.queryByTestId('messages-nav-panel')).not.toBeInTheDocument();
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'messages',
        items: expect.arrayContaining([
          expect.objectContaining({ href: '/messages', label: 'Inbox' }),
          expect.objectContaining({
            href: '/messages/outreach',
            label: 'Outreach sequences',
          }),
          expect.objectContaining({
            href: '/messages/replies',
            label: 'Replies',
          }),
          expect.objectContaining({
            href: '/messages/reply-drip',
            label: 'Reply drip',
          }),
        ]),
        sectionLabel: 'Messages',
      }),
    );
    expect(appSidebarSpy.mock.lastCall?.[0]).not.toHaveProperty('renderBody');
    expect(appSidebarSpy.mock.lastCall?.[0]).not.toHaveProperty(
      'showPrimaryItems',
    );
    expect(
      screen.queryByRole('button', { name: 'New Task' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Search' }),
    ).not.toBeInTheDocument();
  });

  it('hands the nav column to the Library actions and folders panel', () => {
    mockPathname.value = '/org-123/brand-123/library/videos';

    render(
      <AppProtectedLayout>
        <div>Library canvas</div>
      </AppProtectedLayout>,
    );

    expect(screen.getByTestId('library-nav-panel')).toBeInTheDocument();
    expect(screen.getByTestId('library-sidebar-nav')).toBeInTheDocument();
    expect(screen.getByText('Library nav')).toBeInTheDocument();
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'library',
        items: [],
        renderBody: expect.any(Function),
        sectionLabel: 'Library',
        showPrimaryItems: false,
      }),
    );
  });

  it('gives workflow routes their own nav column', () => {
    mockPathname.value = '/org-123/brand-123/automation/workflows';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'automation',
        sectionLabel: 'Automation',
      }),
    );
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
  });

  it('gives Studio routes their own nav column', () => {
    mockPathname.value = '/org-123/brand-123/studio/storyboard';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'studio',
        sectionLabel: 'Studio',
      }),
    );
    expect(appSidebarSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty('backHref');
    expect(appSidebarSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'backLabel',
    );
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
  });

  it.each([
    ['/org-123/brand-123/studio/storyboard', 'studio', 'Studio'],
    ['/org-123/brand-123/library', 'library', 'Library'],
    ['/org-123/brand-123/analytics', 'analytics', 'Analytics'],
    ['/org-123/brand-123/automation/workflows', 'automation', 'Automation'],
    ['/org-123/brand-123/publishing/remix', 'publishing', 'Publishing'],
  ])(
    'keeps the %s app-switcher surface on its own module nav',
    (pathname, currentApp, sectionLabel) => {
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
        }),
      );
      expect(sidebarProps).not.toHaveProperty('backHref');
      expect(sidebarProps).not.toHaveProperty('backLabel');
      expect(
        screen.queryByRole('link', { name: 'Back to Workspace' }),
      ).not.toBeInTheDocument();
    },
  );

  it('renders admin routes through the admin sidebar', () => {
    mockPathname.value = '/admin';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ label: 'Dashboard' }),
        ]),
        showUserProfile: true,
      }),
    );
    expect(screen.queryByTestId('agent-thread-list')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('universal-workspace-shell'),
    ).not.toBeInTheDocument();
    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isWorkspaceShell: false }),
    );
  });

  it('forwards collapse state and control into the dedicated Library sidebar', () => {
    const onToggleCollapse = vi.fn();

    render(
      <AppProtectedLayoutSidebar
        currentApp="library"
        isCollapsed
        onToggleCollapse={onToggleCollapse}
        isAdminRoute={false}
        isAnalyticsRoute={false}
        isArtifactsRoute={false}
        isConversationRoute={false}
        isFocusedOnboardingRoute={false}
        isLibraryRoute
        isOrgRoute={false}
        isPublishingRoute={false}
        isDiscoveryRoute={false}
        isSettingsRoute={false}
        isStudioRoute={false}
        isAutomationRoute={false}
        adminMenuItems={[]}
        analyticsMenuItems={[]}
        libraryMenuItems={[{ href: '/library/images', label: 'Images' }]}
        menuItems={[]}
        orgMenuItems={[]}
        publishingMenuItems={[]}
        discoveryMenuItems={[]}
        secondaryMenuItems={[]}
        settingsMenuItems={[]}
        studioMenuItems={[]}
        automationMenuItems={[]}
        messagesMenuItems={[]}
        onOpenCommandPalette={vi.fn()}
      />,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'library',
        isCollapsed: true,
        onToggleCollapse,
        sectionLabel: 'Library',
      }),
    );
  });

  it('mounts settings search on the settings sidebar', () => {
    render(
      <AppProtectedLayoutSidebar
        currentApp="workspace"
        isAdminRoute={false}
        isAnalyticsRoute={false}
        isConversationRoute={false}
        isFocusedOnboardingRoute={false}
        isLibraryRoute={false}
        isOrgRoute={false}
        isPublishingRoute={false}
        isDiscoveryRoute={false}
        isSettingsRoute
        isStudioRoute={false}
        isAutomationRoute={false}
        adminMenuItems={[]}
        analyticsMenuItems={[]}
        libraryMenuItems={[]}
        menuItems={[]}
        orgMenuItems={[]}
        publishingMenuItems={[]}
        discoveryMenuItems={[]}
        secondaryMenuItems={[]}
        settingsMenuItems={[{ href: '/settings', label: 'Personal' }]}
        studioMenuItems={[]}
        automationMenuItems={[]}
        messagesMenuItems={[]}
        onOpenCommandPalette={vi.fn()}
      />,
    );

    expect(screen.getByTestId('settings-search')).toBeInTheDocument();
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        renderTopSlot: expect.any(Function),
      }),
    );
  });

  it('lets a module swap its own nav panel in for the surface menu items', () => {
    render(
      <AppProtectedLayoutSidebar
        currentApp="library"
        isAdminRoute={false}
        isAnalyticsRoute={false}
        isArtifactsRoute={false}
        isConversationRoute={false}
        isFocusedOnboardingRoute={false}
        isLibraryRoute
        isOrgRoute={false}
        isPublishingRoute={false}
        isDiscoveryRoute={false}
        isSettingsRoute={false}
        isStudioRoute={false}
        isAutomationRoute={false}
        adminMenuItems={[]}
        analyticsMenuItems={[]}
        libraryMenuItems={[{ href: '/library/images', label: 'Images' }]}
        menuItems={[]}
        orgMenuItems={[]}
        publishingMenuItems={[]}
        discoveryMenuItems={[]}
        secondaryMenuItems={[]}
        settingsMenuItems={[]}
        studioMenuItems={[]}
        automationMenuItems={[]}
        messagesMenuItems={[]}
        navPanel={{
          render: () => <div data-testid="module-nav-panel" />,
          sectionLabel: 'Collections',
        }}
        onOpenCommandPalette={vi.fn()}
      />,
    );

    // The surface keeps its identity — only the column body changes hands.
    expect(screen.getByTestId('module-nav-panel')).toBeInTheDocument();
    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'library',
        items: [],
        renderBody: expect.any(Function),
        sectionLabel: 'Collections',
        showPrimaryItems: false,
      }),
    );
  });

  it('keeps the studio sidebar to production surfaces only', () => {
    mockPathname.value = '/studio/storyboard';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ href: '/studio/generate' }),
          expect.objectContaining({ href: '/studio/storyboard' }),
          expect.objectContaining({ href: '/studio/clips' }),
          expect.objectContaining({ href: '/studio/batch' }),
        ]),
      }),
    );

    // One prompt bar at `/studio/generate` replaced the per-type tabs, and no
    // Studio nav entry hands the operator off to another module app.
    for (const retiredHref of [
      '/studio/image',
      '/studio/video',
      '/studio/avatar',
      '/studio/music',
      '/studio/audio',
      '/library/voices',
    ]) {
      expect(appSidebarSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ href: retiredHref }),
          ]),
        }),
      );
    }
  });

  it('renders a dedicated discovery sidebar on discovery routes', () => {
    mockPathname.value = '/discovery/overview';

    render(
      <AppProtectedLayout>
        <div>Protected content</div>
      </AppProtectedLayout>,
    );

    expect(appSidebarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'discovery',
        items: [
          { href: '/discovery/overview', label: 'Overview' },
          { href: '/discovery/following', label: 'Following' },
          { href: '/discovery/ads', label: 'Ads' },
        ],
        sectionLabel: 'Discovery',
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

  it('keeps the studio edit surface inside the workspace shell while skipping editor-only providers', () => {
    mockPathname.value = '/org-123/brand-123/studio/edit/new';

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
    // Canvas routes own their left rail, so the module sidebar stays out while
    // the shell frame itself remains.
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('streak-notifications-bridge'),
    ).not.toBeInTheDocument();
  });

  it('keeps workflow editor detail routes inside the workspace shell', () => {
    mockPathname.value = '/org-123/brand-123/automation/workflows/workflow-123';

    render(
      <AppProtectedLayout>
        <div>Workflow editor</div>
      </AppProtectedLayout>,
    );

    expect(appLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isWorkspaceShell: true }),
    );
    expect(screen.getByText('Workflow editor')).toBeInTheDocument();
    // Canvas route: the graph editor owns the left rail, so no module sidebar.
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-panel')).not.toBeInTheDocument();
  });
});
