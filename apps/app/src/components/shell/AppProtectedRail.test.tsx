const badgeCounts = vi.hoisted(() => ({ workspace: 0, ready: 0, pending: 0 }));
vi.mock('@genfeedai/hooks/data/tasks/use-workspace-inbox-count', () => ({
  useWorkspaceInboxCount: () => badgeCounts.workspace,
}));
vi.mock('@genfeedai/hooks/data/overview/use-overview-bootstrap', () => ({
  useOverviewBootstrap: () => ({
    reviewInbox: {
      readyCount: badgeCounts.ready,
      pendingCount: badgeCounts.pending,
    },
  }),
}));
vi.mock('@/lib/analytics/app-rail-analytics', () => ({
  captureAppRailNavigation: vi.fn(),
}));
const messagesUnread = vi.hoisted(() => ({
  count: 0,
  spy: vi.fn(),
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
const mockOrgUrl = vi.hoisted(() => ({
  brandSlug: 'brand' as string | undefined,
  orgSlug: 'acme' as string | undefined,
}));

vi.mock('@genfeedai/contracts', () => ({
  SettingsSurface: {
    BRAND: 'brand',
    ORGANIZATION: 'organization',
    PERSONAL: 'personal',
  },
}));

vi.mock('@genfeedai/contracts/constants', () => ({
  APP_DISPLAY_LABELS: {
    admin: 'Admin',
    agent: 'Agent',
    analytics: 'Analytics',
    automation: 'Automation',
    discovery: 'Discovery',
    library: 'Library',
    messages: 'Messages',
    publishing: 'Publishing',
    studio: 'Studio',
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
    settings: { subscriptionTier: 'pro' },
  }),
}));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => mockAccessState,
  }),
);

vi.mock('@ui/shell/app-rail/AppRail', () => ({
  AppRail: (props: Record<string, unknown> & { header?: ReactNode }) => {
    appRailSpy(props);
    return (
      <nav aria-label="Apps" data-testid="app-rail">
        {props.header}
      </nav>
    );
  },
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
  it('uses existing unread tasks and ready-for-review counts, excluding generating items', () => {
    badgeCounts.workspace = 4;
    badgeCounts.ready = 3;
    badgeCounts.pending = 9;
    render(<AppProtectedRail orgSlug="acme" />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        badges: expect.objectContaining({
          workspace: { count: 4, label: 'workspaceBadge' },
          publishing: { count: 3, label: 'publishingBadge' },
        }),
        surface: 'desktop',
      }),
    );
  });

  it('marks the AppLayout drawer clone as the drawer analytics surface', () => {
    render(<AppProtectedRail orgSlug="acme" onNavigate={vi.fn()} />);
    expect(appRailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ surface: 'drawer' }),
    );
  });

  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockPathname.value = '/acme/brand/workspace';
    mockAccessState.isAssetGateLocked = false;
    mockAccessState.isSuperAdmin = false;
    mockOrgUrl.brandSlug = 'brand';
    mockOrgUrl.orgSlug = 'acme';
    appRailSpy.mockClear();
    messagesUnread.count = 0;
    badgeCounts.workspace = 0;
    badgeCounts.ready = 0;
    badgeCounts.pending = 0;
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

  it('pins the organization avatar at the top of the rail', () => {
    render(<AppProtectedRail orgSlug="acme" brandSlug="brand" />);

    const organization = screen.getByTestId('organization-switcher');
    expect(organization).toHaveAttribute('data-subscription-tier', 'pro');
  });

  it('keeps the organization avatar on organization settings pages', () => {
    mockPathname.value = '/acme/~/settings/general';

    render(<AppProtectedRail orgSlug="acme" />);

    expect(screen.getByTestId('organization-switcher')).toBeInTheDocument();
  });

  it('hides the organization avatar on personal-account settings pages (#4659)', () => {
    for (const pathname of [
      '/settings',
      '/settings/personal',
      '/acme/~/settings/personal',
      '/acme/~/settings/notifications',
    ]) {
      mockPathname.value = pathname;

      const { unmount } = render(<AppProtectedRail orgSlug="acme" />);

      expect(
        screen.queryByTestId('organization-switcher'),
      ).not.toBeInTheDocument();
      unmount();
    }
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
