const badgeCounts = vi.hoisted(() => ({ workspace: 0 }));
vi.mock('@genfeedai/hooks/data/tasks/use-workspace-inbox-count', () => ({
  useWorkspaceInboxCount: () => badgeCounts.workspace,
}));
vi.mock('@/lib/analytics/app-rail-analytics', () => ({
  captureAppRailNavigation: vi.fn(),
  captureAppRailReorder: vi.fn(),
}));
const messagesUnread = vi.hoisted(() => ({
  count: 0,
  spy: vi.fn(),
}));
const preferences = vi.hoisted(() => ({
  resetRail: vi.fn(),
  setRailAppOrder: vi.fn(),
  togglePin: vi.fn(),
}));
const savedPreferences = vi.hoisted(() => ({
  hiddenAppIds: ['library'] as string[],
  railAppOrder: ['library', 'agent'] as string[],
}));
vi.mock('@/components/shell/rail-preferences.provider', () => ({
  useRailPreferencesContext: () => ({
    isLoaded: true,
    pinnedAppIds: ['playground'],
    ...savedPreferences,
    ...preferences,
  }),
}));
// The rail only forwards module access; the app list is the home page's.
vi.mock('@ui/shell/app-rail/app-rail.availability', () => ({
  resolveAvailableRailApps: () => [],
}));
const installedApps = vi.hoisted(() => ({
  installedAppIds: ['playground', 'turbo'] as string[],
  status: 'ready' as 'loading' | 'ready' | 'error',
}));
vi.mock('@/components/shell/installed-apps.provider', () => ({
  useInstalledApps: () => ({
    ...installedApps,
    install: vi.fn(),
    pendingAppIds: [],
    uninstall: vi.fn(),
  }),
}));
vi.mock('@/components/shell/use-messages-unread-count', () => ({
  useMessagesUnreadCount: (
    brandId?: string,
    isBrandScopeResolved?: boolean,
  ) => {
    messagesUnread.spy(brandId, isBrandScopeResolved);
    return messagesUnread.count;
  },
}));

// The constants barrel is mocked below, so the catalog-backed stub cannot load.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    key === 'unreadBadge' ? `${values?.count} unread conversations` : key,
}));

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockSearchParams = new URLSearchParams();
const appRailSpy = vi.hoisted(() => vi.fn());
const mockPathname = vi.hoisted(() => ({
  value: '/acme/brand/workspace',
}));
const mockAccessState = vi.hoisted(() => ({
  isAssetGateLocked: false,
  isSuperAdmin: false,
}));
const mockDesktop = vi.hoisted(() => ({
  isDesktop: false,
  openExternalPath: vi.fn(),
  platformRole: 'USER' as string,
}));
const mockOrgUrl = vi.hoisted(() => ({
  brandSlug: 'brand' as string | undefined,
  orgSlug: 'acme' as string | undefined,
}));

// Admin → Flags as the release migration leaves it.
vi.mock('@genfeedai/hooks/feature-flags/provider', () => ({
  useFeatureFlagContext: () => ({
    flags: {
      release_analytics: true,
      release_discovery: true,
      release_publishing: true,
      release_turbo: true,
    },
    isConfigured: true,
    isReady: true,
  }),
}));

vi.mock('@genfeedai/contracts', () => ({
  PlatformRole: { SUPERADMIN: 'SUPERADMIN', USER: 'USER' },
  SettingsSurface: {
    BRAND: 'brand',
    ORGANIZATION: 'organization',
    PERSONAL: 'personal',
  },
}));

vi.mock('@genfeedai/contracts/constants', async () => ({
  ...(await import('@genfeedai/contracts/constants/native-apps.constant')),
  ...(await import(
    '@genfeedai/contracts/constants/organization-modules.constant'
  )),
  APP_DISPLAY_LABELS: {
    admin: 'Admin',
    agent: 'Agent',
    analytics: 'Analytics',
    automation: 'Automation',
    discovery: 'Discovery',
    library: 'Library',
    messages: 'Messages',
    publishing: 'Publishing',
    workspace: 'Workspace',
  },
  APP_ROUTE_PREFIXES: {
    ADMIN: '/admin',
    SETTINGS: '/settings',
    WORKSPACE: '/workspace',
  },
  APP_ROUTES: {
    AGENT: {
      JOURNEY: '/agent/journey',
      NEW: '/agent/new',
      ONBOARDING: '/agent/onboarding',
      ROOT: '/agent',
    },
    CONNECT: '/connect',
    LOGIN: '/login',
    LOGOUT: '/logout',
    OAUTH: '/oauth',
    SETTINGS: {
      BRANDS: '/settings/brands',
      PUBLISHING: '/settings/publishing',
    },
    SIGN_UP: '/signup',
    EXPLORE: { ROOT: '/explore' },
    WORKSPACE: {
      ACTIVITY: '/workspace/activity',
      OVERVIEW: '/workspace/overview',
    },
  },
  createBrandAppRoute: (orgSlug: string, brandSlug: string, routePath = '/') =>
    `/${orgSlug}/${brandSlug}${routePath.startsWith('/') ? routePath : `/${routePath}`}`,
  createOrganizationAppRoute: (orgSlug: string, routePath = '/') =>
    `/${orgSlug}/~${routePath.startsWith('/') ? routePath : `/${routePath}`}`,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => mockOrgUrl,
}));

const brandContextState = vi.hoisted(() => ({
  settings: { hasOrganizationBilling: true, moduleOverrides: {} } as Record<
    string,
    unknown
  >,
  settingsLoading: false,
  brands: [
    {
      id: 'brand',
      label: 'Acme Brand',
      organization: { id: 'org', slug: 'acme' },
      slug: 'brand',
    },
  ] as Array<{
    id: string;
    label: string;
    organization: { id: string; slug: string };
    slug: string;
  }>,
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand',
    brands: brandContextState.brands,
    selectedBrand: {
      id: 'brand',
      label: 'Acme Brand',
      organization: { id: 'org', slug: 'acme' },
      slug: 'brand',
    },
    settings: brandContextState.settings,
    settingsLoading: brandContextState.settingsLoading,
  }),
}));

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useOptionalUser: () => ({
    currentUser: { platformRole: mockDesktop.platformRole },
  }),
}));
vi.mock(
  '@genfeedai/hooks/ui/use-is-desktop-client/use-is-desktop-client',
  () => ({ useIsDesktopClient: () => mockDesktop.isDesktop }),
);
vi.mock('@/lib/desktop/runtime', () => ({
  getDesktopBridge: () => ({
    app: { openExternalPath: mockDesktop.openExternalPath },
  }),
}));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => mockAccessState,
  }),
);

vi.mock('@ui/shell/app-rail/AppRail', () => ({
  AppRail: (
    props: Record<string, unknown> & {
      footer?: ReactNode;
      header?: ReactNode;
    },
  ) => {
    appRailSpy(props);
    return (
      <nav aria-label="Apps" data-testid="app-rail">
        {props.header}
        {props.footer}
      </nav>
    );
  },
}));

vi.mock('@ui/shell/app-rail/RailAccount', () => ({
  default: () => <div data-testid="rail-account" />,
}));

vi.mock('@ui/menus/organization-switcher/OrganizationSwitcher', () => ({
  default: ({ subscriptionTier }: { subscriptionTier?: string | null }) => (
    <div
      data-testid="organization-switcher"
      data-subscription-tier={subscriptionTier ?? ''}
    />
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
  useSearchParams: () => mockSearchParams,
}));

const { default: AppProtectedRail } = await import('./AppProtectedRail');

type RailProps = {
  preservedSearch?: string;
  resolveNavigation?: (href: string) => {
    announcement?: string;
    href: string;
  };
};

describe('AppProtectedRail', () => {
  it('uses only Workspace and Messages unread counts', () => {
    badgeCounts.workspace = 4;
    render(<AppProtectedRail orgSlug="acme" />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        badges: {
          workspace: { count: 4, kind: 'dot', label: 'workspaceBadge' },
          messages: { count: 0, label: '0 unread conversations' },
        },
        pinnedAppIds: ['playground'],
        surface: 'desktop',
      }),
    );
    // The Explore link lives in the topbar, not the rail.
    expect(appRailSpy.mock.lastCall?.[0]).not.toHaveProperty('exploreHref');
    // The member's order and pins flow in and out through the shared context.
    expect(appRailSpy.mock.lastCall?.[0]).toMatchObject({
      hiddenAppIds: ['library'],
      onRailAppOrderChange: preferences.setRailAppOrder,
      onResetRail: preferences.resetRail,
      onTogglePin: preferences.togglePin,
      railAppOrder: ['library', 'agent'],
    });
  });

  describe('organization rail defaults', () => {
    it('follows the organization order until the member sets their own', () => {
      savedPreferences.railAppOrder = [];
      brandContextState.settings = {
        ...brandContextState.settings,
        defaultHomeAppId: 'agent',
        defaultRailOrder: ['analytics', 'bogus', 'agent', 'analytics'],
      };
      render(<AppProtectedRail orgSlug="acme" />);
      expect(appRailSpy.mock.lastCall?.[0]).toMatchObject({
        railAppOrder: ['analytics', 'agent'],
      });
    });

    it("keeps the member's own order over the organization's", () => {
      savedPreferences.railAppOrder = ['library'];
      brandContextState.settings = {
        ...brandContextState.settings,
        defaultRailOrder: ['analytics', 'agent'],
      };
      render(<AppProtectedRail orgSlug="acme" />);
      expect(appRailSpy.mock.lastCall?.[0]).toMatchObject({
        railAppOrder: ['library'],
      });
    });
  });

  it('puts Help and the account avatar in the rail footer', () => {
    render(<AppProtectedRail orgSlug="acme" />);

    expect(screen.getByTestId('rail-account')).toBeInTheDocument();
  });

  it('marks the AppLayout drawer clone as the drawer analytics surface', () => {
    render(<AppProtectedRail orgSlug="acme" onNavigate={vi.fn()} />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ surface: 'drawer' }),
    );
  });

  beforeEach(() => {
    savedPreferences.hiddenAppIds = ['library'];
    savedPreferences.railAppOrder = ['library', 'agent'];
    brandContextState.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: {},
    };
    brandContextState.settingsLoading = false;
    mockSearchParams = new URLSearchParams();
    mockPathname.value = '/acme/brand/workspace';
    mockAccessState.isAssetGateLocked = false;
    mockAccessState.isSuperAdmin = false;
    mockDesktop.isDesktop = false;
    mockDesktop.openExternalPath.mockReset();
    mockDesktop.platformRole = 'USER';
    mockOrgUrl.brandSlug = 'brand';
    mockOrgUrl.orgSlug = 'acme';
    appRailSpy.mockClear();
    messagesUnread.count = 0;
    badgeCounts.workspace = 0;
    messagesUnread.spy.mockClear();
    brandContextState.brands = [
      {
        id: 'brand',
        label: 'Acme Brand',
        organization: { id: 'org', slug: 'acme' },
        slug: 'brand',
      },
    ];
  });

  it('forwards settled module defaults to both rail surfaces without changing saved pins', () => {
    render(<AppProtectedRail orgSlug="acme" onNavigate={vi.fn()} />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        surface: 'drawer',
        pinnedAppIds: ['playground'],
        modulePreferences: expect.objectContaining({
          playground: true,
          storyboard: true,
          publishing: true,
          analytics: true,
          automation: false,
          messages: false,
          discovery: true,
          clips: false,
        }),
      }),
    );
  });

  it('waits for verified settings during a scope refresh', () => {
    brandContextState.settingsLoading = true;
    render(<AppProtectedRail orgSlug="acme" />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ moduleAccess: null, modulePreferences: null }),
    );
  });

  it('feeds the rail confirmed installs and module access (#5502)', () => {
    render(<AppProtectedRail orgSlug="acme" />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        installedAppIds: ['playground', 'turbo'],
        moduleAccess: expect.objectContaining({
          playground: { isAllowed: true, reason: null },
          clips: { isAllowed: false, reason: 'unreleased' },
        }),
      }),
    );
  });

  it('shows no launcher apps until installs are confirmed', () => {
    installedApps.status = 'loading';
    render(<AppProtectedRail orgSlug="acme" />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ installedAppIds: [] }),
    );
    installedApps.status = 'ready';
  });

  it('opens unreleased apps to an organization on release preview', () => {
    brandContextState.settings = {
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: { clips: true },
    };
    render(<AppProtectedRail orgSlug="acme" />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        moduleAccess: expect.objectContaining({
          clips: { isAllowed: true, reason: null },
        }),
      }),
    );
  });

  it('keeps unreleased apps closed to a super admin without release preview', () => {
    mockAccessState.isSuperAdmin = true;
    render(<AppProtectedRail orgSlug="acme" />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        moduleAccess: expect.objectContaining({
          clips: { isAllowed: false, reason: 'unreleased' },
        }),
      }),
    );
  });

  it('highlights from the current pathname', () => {
    mockPathname.value = '/acme/brand/studio/clips';

    render(<AppProtectedRail orgSlug="acme" brandSlug="brand" />);

    expect(screen.getByTestId('app-rail')).toBeInTheDocument();
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentPath: '/acme/brand/studio/clips' }),
    );
  });

  it('badges the Messages item with the route brand unread count', () => {
    messagesUnread.count = 3;

    render(<AppProtectedRail orgSlug="acme" brandSlug="brand" />);

    expect(messagesUnread.spy).toHaveBeenLastCalledWith('brand', true);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        badges: expect.objectContaining({
          messages: { count: 3, label: '3 unread conversations' },
        }),
      }),
    );
  });

  it('counts every brand for the org-scoped Messages item', () => {
    render(<AppProtectedRail orgSlug="acme" />);

    expect(messagesUnread.spy).toHaveBeenLastCalledWith(undefined, true);
  });

  it('never falls back to the org-wide count while the routed brand has not loaded yet', () => {
    brandContextState.brands = [];

    render(<AppProtectedRail orgSlug="acme" brandSlug="brand" />);

    // Unresolved: no brand id yet, and the hook must not fetch org-wide
    // instead — that would flash the wrong count once brands load.
    expect(messagesUnread.spy).toHaveBeenLastCalledWith(undefined, false);
  });

  it('does not inject the context brand into explicit org-scoped routes', () => {
    render(<AppProtectedRail orgSlug="acme" />);

    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        brandAwareSlug: 'brand',
        brandSlug: undefined,
        orgSlug: 'acme',
      }),
    );
  });

  it('passes an explicit brand route through', () => {
    render(<AppProtectedRail orgSlug="acme" brandSlug="brand" />);

    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        brandSlug: 'brand',
        orgSlug: 'acme',
      }),
    );
  });

  it('falls back to the session org when the route has none', () => {
    render(<AppProtectedRail />);

    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ brandSlug: 'brand', orgSlug: 'acme' }),
    );
  });

  it('renders nothing without any organization scope', () => {
    mockOrgUrl.brandSlug = undefined;
    mockOrgUrl.orgSlug = undefined;

    render(<AppProtectedRail />);

    expect(screen.queryByTestId('app-rail')).not.toBeInTheDocument();
  });

  it('offers Admin to platform admins only', () => {
    const { unmount } = render(<AppProtectedRail orgSlug="acme" />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ showAdmin: false }),
    );
    unmount();

    mockAccessState.isSuperAdmin = true;
    render(<AppProtectedRail orgSlug="acme" />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ showAdmin: true }),
    );
  });

  it('offers a desktop platform admin Admin in the system browser', () => {
    mockDesktop.isDesktop = true;
    mockDesktop.platformRole = 'SUPERADMIN';
    render(<AppProtectedRail orgSlug="acme" />);

    const props = appRailSpy.mock.lastCall?.[0] as {
      onOpenAdminExternally?: (href: string) => void;
      showAdmin: boolean;
    };
    expect(props.showAdmin).toBe(true);

    props.onOpenAdminExternally?.('/admin/overview/dashboard');
    expect(mockDesktop.openExternalPath).toHaveBeenCalledWith(
      '/admin/overview/dashboard',
    );
  });

  it('keeps Admin in the shell where the API already grants super admin', () => {
    mockDesktop.isDesktop = true;
    mockDesktop.platformRole = 'SUPERADMIN';
    mockAccessState.isSuperAdmin = true;
    render(<AppProtectedRail orgSlug="acme" />);

    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onOpenAdminExternally: undefined,
        showAdmin: true,
      }),
    );
  });

  it('hides Admin from desktop members without the platform role', () => {
    mockDesktop.isDesktop = true;
    render(<AppProtectedRail orgSlug="acme" />);

    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onOpenAdminExternally: undefined,
        showAdmin: false,
      }),
    );
  });

  it('never opens Admin externally on the web', () => {
    mockDesktop.platformRole = 'SUPERADMIN';
    render(<AppProtectedRail orgSlug="acme" />);

    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onOpenAdminExternally: undefined,
        showAdmin: false,
      }),
    );
  });

  it('always offers Admin in admin chrome', () => {
    render(<AppProtectedRail orgSlug="acme" isAdminChrome />);

    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ showAdmin: true }),
    );
  });

  it('forwards the first-asset gate and the drawer close callback', () => {
    mockAccessState.isAssetGateLocked = true;
    const onNavigate = vi.fn();

    render(<AppProtectedRail orgSlug="acme" onNavigate={onNavigate} />);

    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ isAssetGateLocked: true, onNavigate }),
    );
  });

  it('leaves the organization switcher to the topbar', () => {
    render(<AppProtectedRail orgSlug="acme" brandSlug="brand" />);

    expect(screen.queryByTestId('organization-switcher')).toBeNull();
    expect(appRailSpy.mock.lastCall?.[0].header).toBeUndefined();
  });

  it('launches rail destinations through the trusted shell resolver', () => {
    mockSearchParams = new URLSearchParams([
      ['taskId', 'task-1'],
      ['taskSource', 'workspace'],
      ['thread', 'thread-1'],
    ]);

    render(<AppProtectedRail orgSlug="acme" brandSlug="brand" />);

    const railProps = appRailSpy.mock.lastCall?.[0] as RailProps;

    expect(railProps.preservedSearch).toBe(
      'taskId=task-1&taskSource=workspace',
    );
    expect(
      railProps.resolveNavigation?.('/acme/brand/analytics?taskId=task-1'),
    ).toEqual({
      announcement: 'Opening analytics in canvas mode.',
      href: '/acme/brand/analytics?taskId=task-1',
    });
  });
});
