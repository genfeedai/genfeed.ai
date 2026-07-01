import type { MenuConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuShellConfig } from '@genfeedai/props/navigation/menu.props';
import { fireEvent, render, screen } from '@testing-library/react';
import MenuShared from '@ui/menus/shared/MenuShared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPush,
  mockEnterNestedGroup,
  mockExitNestedGroup,
  mockBrandState,
  mockLogoUrl,
  mockPathname,
} = vi.hoisted(() => ({
  mockBrandState: {
    selectedBrand: null as { label?: string } | null,
  },
  mockEnterNestedGroup: vi.fn(),
  mockExitNestedGroup: vi.fn(),
  mockLogoUrl: { value: '' },
  mockPathname: { value: '/settings/personal' },
  mockPush: vi.fn(),
}));
const originalLocation = window.location;

// @genfeedai/auth-client/react is already mocked globally in setup.ts
// Add UserButton that's not in the global mock
vi.mock('@genfeedai/auth-client/react', () => {
  return {
    BetterAuthProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    UserButton: () => <div data-testid="user-button" />,
    useAuth: () => ({
      getToken: vi.fn().mockResolvedValue('mock-token'),
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_test123',
      sessionId: 'sess_test123',
      userId: 'user_test123',
    }),
    useOrganization: () => ({
      isLoaded: true,
      membership: { role: 'org:admin' },
      organization: { id: 'org_test123', name: 'Test Org' },
    }),
    useOrganizationList: () => ({
      isLoaded: true,
      setActive: vi.fn(),
      userMemberships: { data: [] },
    }),
    useUser: () => ({
      isLoaded: true,
      isSignedIn: true,
      user: {
        emailAddresses: [{ emailAddress: 'test@example.com', id: 'email_1' }],
        firstName: 'Test',
        fullName: 'Test User',
        id: 'user_test123',
        imageUrl: 'https://example.com/avatar.png',
        lastName: 'User',
        primaryEmailAddress: { emailAddress: 'test@example.com' },
      },
    }),
  };
});

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: vi.fn().mockResolvedValue('mock-token'),
    isLoaded: true,
    isSignedIn: true,
    orgId: 'org_test123',
    sessionId: 'sess_test123',
    userId: 'user_test123',
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      emailAddresses: [{ emailAddress: 'test@example.com', id: 'email_1' }],
      firstName: 'Test',
      fullName: 'Test User',
      id: 'user_test123',
      imageUrl: 'https://example.com/avatar.png',
      lastName: 'User',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: null,
    brands: [],
    selectedBrand: mockBrandState.selectedBrand,
  }),
}));

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => ({
    enterNestedGroup: mockEnterNestedGroup,
    exitNestedGroup: mockExitNestedGroup,
    nestedGroupId: null,
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', async () => {
  const actual =
    await vi.importActual<typeof import('next/navigation')>('next/navigation');

  return {
    ...actual,
    useParams: () => ({
      brandSlug: 'moonrise-studio',
      orgSlug: 'acme',
    }),
    usePathname: () => mockPathname.value,
    useRouter: () => ({ push: mockPush }),
  };
});

vi.mock('@genfeedai/hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => mockLogoUrl.value,
}));

vi.mock('@genfeedai/hooks/data/overview/use-overview-bootstrap', () => ({
  useOverviewBootstrap: () => ({
    reviewInbox: {
      changesRequestedCount: 4,
      pendingCount: 30,
      readyCount: 6,
      rejectedCount: 0,
    },
  }),
}));

vi.mock('@ui/menus/item/MenuItem', () => ({
  default: ({ badgeCount, label }: { badgeCount?: number; label: string }) => (
    <div data-testid="menu-item">
      {label}
      {badgeCount ? ` (${badgeCount})` : ''}
    </div>
  ),
}));

vi.mock('@ui/menus/sidebar-nested/SidebarNested', () => ({
  default: () => <div data-testid="sidebar-nested" />,
}));

vi.mock('@ui/buttons/credits/ButtonCredits', () => ({
  default: () => <div data-testid="button-credits" />,
}));

vi.mock('@ui/shell/app-switcher/AppSwitcher', () => ({
  AppSwitcher: () => <div data-testid="app-switcher" />,
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    LOGO_ALT: 'Genfeed',
    social: { discord: '#', twitter: '#' },
  },
}));

describe('MenuShared', () => {
  beforeEach(() => {
    mockEnterNestedGroup.mockClear();
    mockExitNestedGroup.mockClear();
    mockPush.mockClear();
    mockBrandState.selectedBrand = null;
    mockLogoUrl.value = '';
    mockPathname.value = '/settings/personal';
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
  });

  const config: MenuConfig = {
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
      },
    ],
    logoHref: '/',
  };

  it('should render without crashing', () => {
    const { container } = render(<MenuShared config={config} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render menu items', () => {
    render(<MenuShared config={config} />);
    expect(
      document.querySelector('[data-testid="menu-item"]'),
    ).toBeInTheDocument();
  });

  it('should render root element', () => {
    const { container } = render(<MenuShared config={config} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders the sidebar header spacer', () => {
    render(<MenuShared config={config} />);

    expect(screen.queryByTestId('sidebar-header-shell')).toBeInTheDocument();
  });

  it('renders a top slot before navigation items when provided', () => {
    render(
      <MenuShared
        config={config}
        renderTopSlot={() => <div data-testid="sidebar-top-slot">Search</div>}
      />,
    );

    const topSlot = screen.getByTestId('sidebar-top-slot');
    const firstMenuItem = screen.getByText('Dashboard');

    expect(topSlot).toBeInTheDocument();
    expect(
      topSlot.compareDocumentPosition(firstMenuItem) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps organization switching out of the sidebar header shell', () => {
    render(<MenuShared config={config} />);

    expect(screen.getByTestId('sidebar-header-shell')).toBeInTheDocument();
    expect(
      screen.queryByTestId('organization-switcher'),
    ).not.toBeInTheDocument();
  });

  it('renders the org switcher slot at the top of the sidebar body, above the top slot and nav', () => {
    render(
      <MenuShared
        config={config}
        orgSwitcherSlot={<div data-testid="organization-switcher">Acme</div>}
        renderTopSlot={() => <div data-testid="sidebar-top-slot">Search</div>}
      />,
    );

    const orgSwitcher = screen.getByTestId('organization-switcher');
    const topSlot = screen.getByTestId('sidebar-top-slot');
    const firstMenuItem = screen.getByText('Dashboard');

    expect(orgSwitcher).toBeInTheDocument();
    expect(
      orgSwitcher.compareDocumentPosition(topSlot) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      topSlot.compareDocumentPosition(firstMenuItem) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('omits the org switcher slot when not provided', () => {
    render(<MenuShared config={config} />);

    expect(
      screen.queryByTestId('organization-switcher'),
    ).not.toBeInTheDocument();
  });

  it('attaches the actionable inbox count to the workspace inbox row', () => {
    const inboxConfig: MenuShellConfig = {
      items: [
        {
          href: '/workspace/overview',
          label: 'Dashboard',
        },
        {
          href: '/workspace/inbox/unread',
          label: 'Inbox',
        },
      ],
      logoHref: '/',
    };

    render(<MenuShared config={inboxConfig} />);

    expect(screen.getByText('Inbox (40)')).toBeInTheDocument();
  });

  it('renders the primary action CTA before navigation items', () => {
    const primaryConfig: MenuShellConfig = {
      items: [
        {
          href: '/overview',
          label: 'Dashboard',
        },
      ],
      logoHref: '/',
      primaryAction: {
        href: '/workspace/overview?compose=1',
        label: 'New Task',
      },
    };

    render(<MenuShared config={primaryConfig} />);

    const actionLabel = screen.getByText('New Task');
    const overviewLabel = screen.getByText('Dashboard');

    expect(
      actionLabel.compareDocumentPosition(overviewLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId('sidebar-primary-action')).toHaveAttribute(
      'href',
      '/acme/moonrise-studio/workspace/overview?compose=1',
    );
    expect(screen.getByText('⌘⇧N')).toBeInTheDocument();
  });

  it('renders dashboard, tasks, and inbox as flat top-level rows while grouping the rest under a workspace heading', () => {
    const workspaceConfig: MenuConfig = {
      items: [
        {
          group: '',
          href: '/workspace/overview',
          label: 'Dashboard',
        },
        {
          group: '',
          href: '/workspace/tasks',
          label: 'Tasks',
        },
        {
          group: '',
          href: '/workspace/inbox/unread',
          label: 'Inbox',
        },
        {
          drillDown: true,
          group: 'Library',
          href: '/library/ingredients',
          label: 'Library',
        },
      ],
      logoHref: '/',
    };

    render(<MenuShared config={workspaceConfig} sectionLabel="Workspace" />);

    expect(
      screen.getByRole('button', { name: 'Workspace' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText(/Inbox/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
  });

  it('renders secondary destinations outside the primary navigation groups', () => {
    const secondaryConfig: MenuShellConfig = {
      items: [
        {
          group: '',
          href: '/workspace/overview',
          label: 'Dashboard',
        },
      ],
      logoHref: '/',
      secondaryItems: [
        {
          group: '',
          href: '/workspace/activity',
          label: 'Activity',
        },
      ],
    };

    render(<MenuShared config={secondaryConfig} />);

    expect(screen.getByTestId('sidebar-secondary-items')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });

  it('does not reuse raw href keys for settings items with different scopes', () => {
    mockPathname.value = '/acme/~/settings/brands';
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const settingsConfig: MenuConfig = {
      items: [
        {
          href: '/settings',
          hrefScope: 'personal',
          label: 'Personal',
        },
        {
          href: '/settings',
          hrefScope: 'organization',
          label: 'Organization',
        },
        {
          href: '/settings/brands',
          hrefScope: 'organization',
          label: 'Brands',
        },
      ],
      logoHref: '/',
    };

    try {
      render(<MenuShared config={settingsConfig} sectionLabel="Settings" />);

      expect(
        consoleError.mock.calls.some((call) =>
          call.some(
            (arg) =>
              typeof arg === 'string' &&
              arg.includes('Encountered two children with the same key'),
          ),
        ),
      ).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('routes the conversations new agent thread CTA directly to /agent/new', () => {
    render(
      <MenuShared
        config={config}
        renderAfterNavigation={() => <div>thread-list</div>}
      />,
    );

    expect(screen.getByRole('link', { name: /New Thread/i })).toHaveAttribute(
      'href',
      '/acme/~/agent/new',
    );
  });

  it('does not add an extra inner horizontal gutter around the new agent thread row', () => {
    render(
      <MenuShared
        config={config}
        renderAfterNavigation={() => <div>thread-list</div>}
      />,
    );

    expect(
      screen.getByRole('link', { name: /New Thread/i }).parentElement,
    ).not.toHaveClass('px-2');
  });

  it('renders conversations in a dedicated flex section when the thread list is present', () => {
    render(
      <MenuShared
        config={config}
        renderAfterNavigation={() => (
          <div data-testid="thread-list">thread-list</div>
        )}
      />,
    );

    expect(screen.getByTestId('sidebar-conversations-section')).toHaveClass(
      'flex',
      'min-h-0',
      'flex-1',
      'flex-col',
    );
    expect(screen.getByTestId('thread-list')).toBeInTheDocument();
  });

  it('can hide primary CTA when rendering contextual sidebar content', () => {
    const primaryConfig: MenuConfig = {
      items: [
        {
          href: '/agent',
          isPrimary: true,
          label: 'Chat',
        },
        {
          href: '/overview',
          label: 'Overview',
        },
      ],
      logoHref: '/',
    };

    render(
      <MenuShared
        config={primaryConfig}
        renderBody={() => <div data-testid="custom-body">Custom body</div>}
        showPrimaryItems={false}
      />,
    );

    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    expect(screen.getByTestId('custom-body')).toBeInTheDocument();
  });

  it('does not duplicate workspace context in the sidebar header', () => {
    mockBrandState.selectedBrand = { label: 'Acme Org' };

    render(<MenuShared config={config} />);

    const labels = screen.queryAllByText('Acme Org');
    expect(labels.length).toBeLessThanOrEqual(1);
  });

  it('uses a transparent shell background for the transparent variant', () => {
    render(<MenuShared config={config} shellChromeVariant="transparent" />);

    const sidebarShell = screen.getByTestId('sidebar-shell');

    expect(sidebarShell).toHaveClass('bg-transparent');
    expect(sidebarShell).not.toHaveClass('bg-background');
  });

  it.each([
    { group: 'Settings', href: '/settings/models/all', label: 'Models' },
    { group: 'Insights', href: '/insights/overview', label: 'Overview' },
    { group: 'Content', href: '/content/posts', label: 'Posts' },
  ])('routes to default nested page when clicking group drill-down row', ({
    group,
    href,
    label,
  }) => {
    const nestedConfig: MenuConfig = {
      items: [
        {
          drillDown: true,
          group,
          href,
          label,
        },
        {
          group,
          href: `${href}/secondary`,
          label: 'Secondary',
        },
      ],
      logoHref: '/',
    };

    render(<MenuShared config={nestedConfig} />);

    fireEvent.click(screen.getByRole('link', { name: group }));

    expect(mockEnterNestedGroup).toHaveBeenCalledWith(group);
    expect(mockPush).not.toHaveBeenCalledWith(href);
  });
});
