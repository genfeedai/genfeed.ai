import type { MenuConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
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
  mockSearchParams,
} = vi.hoisted(() => ({
  mockBrandState: {
    selectedBrand: null as { label?: string } | null,
  },
  mockEnterNestedGroup: vi.fn(),
  mockExitNestedGroup: vi.fn(),
  mockLogoUrl: { value: '' },
  mockPathname: { value: '/settings/personal' },
  mockSearchParams: { value: '' },
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
    useSearchParams: () => new URLSearchParams(mockSearchParams.value),
  };
});

vi.mock('@genfeedai/hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => mockLogoUrl.value,
}));

vi.mock('@genfeedai/hooks/data/tasks/use-workspace-inbox-count', () => ({
  useWorkspaceInboxCount: () => 2,
}));

vi.mock('@ui/menus/item/MenuItem', () => ({
  default: ({
    badgeCount,
    href,
    isActive,
    label,
  }: {
    badgeCount?: number;
    href?: string;
    isActive?: boolean;
    label: string;
  }) => (
    <div
      data-active={isActive ? 'true' : 'false'}
      data-href={href}
      data-testid="menu-item"
    >
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
    mockSearchParams.value = '';
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        clear: vi.fn(() => storage.clear()),
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        removeItem: vi.fn((key: string) => storage.delete(key)),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
      },
    });
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

  it('renders the org switcher slot inside the sidebar header shell', () => {
    render(
      <MenuShared
        config={config}
        orgSwitcherSlot={<div data-testid="organization-switcher">Acme</div>}
      />,
    );

    const headerShell = screen.getByTestId('sidebar-header-shell');
    const orgSwitcher = screen.getByTestId('organization-switcher');

    expect(headerShell).toContainElement(orgSwitcher);
  });

  it('renders the org switcher in the header above the top slot and nav', () => {
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
    expect(screen.getByTestId('sidebar-header-shell')).not.toContainElement(
      topSlot,
    );
    expect(
      orgSwitcher.compareDocumentPosition(topSlot) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      topSlot.compareDocumentPosition(firstMenuItem) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows the Genfeed mark at rest and the collapse icon on hover or focus', () => {
    const onToggleCollapse = vi.fn();
    mockLogoUrl.value = '/logo.svg';

    render(
      <MenuShared
        config={config}
        onToggleCollapse={onToggleCollapse}
        orgSwitcherSlot={<div data-testid="organization-switcher">Acme</div>}
      />,
    );

    const headerShell = screen.getByTestId('sidebar-header-shell');
    const collapseToggle = screen.getByRole('button', {
      name: 'Collapse sidebar',
    });
    const toggleIcon = collapseToggle.querySelector('svg');
    const logo = collapseToggle.querySelector('img');

    expect(headerShell).toContainElement(collapseToggle);
    expect(screen.getByRole('link', { name: 'Genfeed home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(collapseToggle).toHaveClass('group');
    expect(logo?.getAttribute('src')).toContain('logo.svg');
    expect(toggleIcon).toBeInTheDocument();
    expect(logo?.parentElement).toHaveClass('group-hover:opacity-0');
    expect(logo?.parentElement).toHaveClass('group-focus-visible:opacity-0');
    expect(toggleIcon?.parentElement).toHaveClass('opacity-0');
    expect(toggleIcon?.parentElement).toHaveClass('group-hover:opacity-100');
    expect(toggleIcon?.parentElement).toHaveClass(
      'group-focus-visible:opacity-100',
    );

    fireEvent.mouseEnter(collapseToggle);
    fireEvent.focus(collapseToggle);

    expect(collapseToggle.querySelector('svg')).toBe(toggleIcon);
    expect(collapseToggle.querySelector('img')).toBe(logo);

    fireEvent.click(collapseToggle);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('omits the org switcher slot when not provided', () => {
    render(<MenuShared config={config} />);

    expect(
      screen.queryByTestId('organization-switcher'),
    ).not.toBeInTheDocument();
  });

  it('attaches the unread workspace task count to the inbox row', () => {
    const inboxConfig: MenuShellConfig = {
      items: [
        {
          href: '/workspace',
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

    expect(screen.getByText('Inbox (2)')).toBeInTheDocument();
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
        href: '/workspace?compose=1',
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
      '/acme/moonrise-studio/workspace?compose=1',
    );
    expect(screen.getByText('⌘⇧N')).toBeInTheDocument();
  });

  it('renders dashboard, tasks, and inbox as flat top-level rows while grouping the rest under a workspace heading', () => {
    const workspaceConfig: MenuConfig = {
      items: [
        {
          group: '',
          href: '/workspace',
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
          href: '/library/videos',
          label: 'Library',
        },
      ],
      logoHref: '/',
    };

    render(<MenuShared config={workspaceConfig} sectionLabel="Workspace" />);

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Workspace').parentElement).toHaveClass('pb-2');
    expect(
      screen.getByText('Workspace').parentElement?.parentElement,
    ).toHaveClass('mt-3');
    expect(
      screen.queryByRole('button', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText(/Inbox/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
  });

  it('renders named menu groups as static section headers by default', () => {
    const groupedConfig: MenuConfig = {
      items: [
        {
          group: 'ATS',
          href: '/candidates',
          label: 'Candidates',
        },
        {
          group: 'ATS',
          href: '/jobs',
          label: 'Jobs',
        },
      ],
      logoHref: '/',
    };

    render(<MenuShared config={groupedConfig} />);

    expect(screen.getByText('ATS')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ATS' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Candidates')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
    expect(screen.getByText('ATS').parentElement).toHaveClass('pb-2');
  });

  it('collapses named menu groups only when the first item opts in', () => {
    const groupedConfig: MenuConfig = {
      items: [
        {
          group: 'Operations',
          href: '/runs',
          isCollapsible: true,
          label: 'Runs',
        },
        {
          group: 'Operations',
          href: '/workflows',
          label: 'Workflows',
        },
      ],
      logoHref: '/',
    };

    render(<MenuShared config={groupedConfig} />);

    fireEvent.click(screen.getByRole('button', { name: 'Operations' }));

    expect(screen.queryByText('Runs')).not.toBeInTheDocument();
    expect(screen.queryByText('Workflows')).not.toBeInTheDocument();
  });

  it('renders secondary destinations outside the primary navigation groups', () => {
    const secondaryConfig: MenuShellConfig = {
      items: [
        {
          group: '',
          href: '/workspace',
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

  it('keeps globally scoped menu hrefs unprefixed', () => {
    const globalConfig: MenuConfig = {
      items: [
        {
          href: '/admin/overview/dashboard',
          hrefScope: 'global',
          label: 'Dashboard',
        },
      ],
      logoHref: '/',
    };

    render(<MenuShared config={globalConfig} />);

    expect(screen.getByText('Dashboard')).toHaveAttribute(
      'data-href',
      '/admin/overview/dashboard',
    );
  });

  it('keeps a nested admin destination active in the global route scope', () => {
    mockPathname.value = '/admin/content/posts';
    const globalConfig: MenuConfig = {
      items: [
        {
          href: '/admin/content/posts',
          hrefScope: 'global',
          label: 'Posts',
        },
      ],
      logoHref: '/admin',
    };

    render(<MenuShared config={globalConfig} />);

    expect(screen.getByText('Posts')).toHaveAttribute('data-active', 'true');
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

  describe('query-specific active state', () => {
    const publishingConfig: MenuConfig = {
      items: [
        { href: '/publishing/posts', label: 'Posts' },
        {
          href: '/publishing/posts?status=draft',
          label: 'Review',
          matchSearchParams: { status: 'draft' },
        },
        {
          href: '/publishing/posts?publicationState=not-posted',
          label: 'Drafts',
          matchSearchParams: {
            publicationState: 'not-posted',
            status: null,
          },
        },
        {
          href: '/publishing/posts?publicationState=posted',
          label: 'Published',
          matchSearchParams: { publicationState: 'posted', status: null },
        },
      ],
      logoHref: '/publishing/posts',
    };

    const activeLabels = () =>
      screen
        .getAllByTestId('menu-item')
        .filter((node) => node.getAttribute('data-active') === 'true')
        .map((node) => node.textContent);

    it('activates the matching Pipeline filter without also activating Posts', () => {
      mockPathname.value = '/acme/moonrise/publishing/posts';
      mockSearchParams.value =
        'publicationState=posted&platform=linkedin&taskId=task-1';

      render(
        <MenuShared config={publishingConfig} sectionLabel="Publishing" />,
      );

      expect(activeLabels()).toEqual(['Published']);
    });

    it('keeps Posts active for filters that do not map to Pipeline', () => {
      mockPathname.value = '/acme/moonrise/publishing/posts';
      mockSearchParams.value = 'type=article&platform=linkedin';

      render(
        <MenuShared config={publishingConfig} sectionLabel="Publishing" />,
      );

      expect(activeLabels()).toEqual(['Posts']);
    });
  });

  describe('workspace overview complete-path active state', () => {
    // Canonical Overview is `/workspace/overview` (bare `/workspace` redirects
    // there via next.config). Complete path does not prefix-match siblings —
    // no isExactMatch required.
    const workspaceConfig: MenuConfig = {
      items: [
        {
          href: '/workspace/overview',
          label: 'Overview',
        },
        {
          href: '/workspace/inbox/unread',
          label: 'Inbox',
        },
        {
          href: '/workspace/tasks',
          label: 'Tasks',
        },
        {
          href: '/workspace/activity',
          label: 'Activity',
        },
      ],
      logoHref: '/workspace/overview',
    };

    const activeLabels = () =>
      screen
        .getAllByTestId('menu-item')
        .filter((node) => node.getAttribute('data-active') === 'true')
        .map((node) => node.textContent);

    it('activates only Overview on /workspace/overview', () => {
      mockPathname.value = '/acme/moonrise/workspace/overview';
      render(<MenuShared config={workspaceConfig} sectionLabel="Workspace" />);
      expect(activeLabels()).toEqual(['Overview']);
    });

    it('activates only Activity on /workspace/activity — not Overview', () => {
      mockPathname.value = '/acme/moonrise/workspace/activity';
      render(<MenuShared config={workspaceConfig} sectionLabel="Workspace" />);
      expect(activeLabels()).toEqual(['Activity']);
    });

    it('activates only Tasks on /workspace/tasks — not Overview', () => {
      mockPathname.value = '/acme/moonrise/workspace/tasks';
      render(<MenuShared config={workspaceConfig} sectionLabel="Workspace" />);
      expect(activeLabels()).toEqual(['Tasks']);
    });
  });

  it('prefers a specific child destination over its parent route prefix', () => {
    mockPathname.value = '/acme/moonrise/automation/templates';

    render(
      <MenuShared
        config={{
          items: [
            { href: '/automation/workflows', label: 'Workflows' },
            {
              href: '/automation/templates',
              label: 'Templates',
            },
            {
              href: '/automation/runs',
              label: 'Runs',
            },
          ],
          logoHref: '/automation',
        }}
        sectionLabel="Automation"
      />,
    );

    const activeLabels = screen
      .getAllByTestId('menu-item')
      .filter((node) => node.getAttribute('data-active') === 'true')
      .map((node) => node.textContent);

    expect(activeLabels).toEqual(['Templates']);
  });

  describe('settings exact-match active state', () => {
    // Mirrors the nested settings sidebar (#1231/#1264 follow-up): scope-scoped
    // items sharing the /settings root must only light up on an exact route.
    const settingsConfig: MenuConfig = {
      items: [
        {
          href: '/settings/personal',
          hrefScope: 'personal',
          isExactMatch: true,
          label: 'Personal',
        },
        {
          href: '/settings/general',
          hrefScope: 'organization',
          isExactMatch: true,
          label: 'General',
        },
        {
          href: '/settings/members',
          hrefScope: 'organization',
          label: 'Members',
        },
        {
          href: '/settings',
          hrefScope: 'brand',
          isExactMatch: true,
          label: 'Overview',
        },
        {
          href: '/settings/voice',
          hrefScope: 'brand',
          label: 'Voice',
        },
      ],
      logoHref: '/',
    };

    const activeLabels = () =>
      screen
        .getAllByTestId('menu-item')
        .filter((node) => node.getAttribute('data-active') === 'true')
        .map((node) => node.textContent);

    it('activates only the personal root on /settings/personal', () => {
      mockPathname.value = '/settings/personal';
      render(<MenuShared config={settingsConfig} sectionLabel="Settings" />);
      expect(activeLabels()).toEqual(['Personal']);
    });

    it('activates General (not Members) on the org settings general route', () => {
      mockPathname.value = '/acme/~/settings/general';
      render(<MenuShared config={settingsConfig} sectionLabel="Settings" />);
      expect(activeLabels()).toEqual(['General']);
    });

    it('activates Members only — not the General root — on an org sub-route', () => {
      mockPathname.value = '/acme/~/settings/members';
      render(<MenuShared config={settingsConfig} sectionLabel="Settings" />);
      expect(activeLabels()).toEqual(['Members']);
    });

    it('activates the brand Overview root on the brand settings root', () => {
      mockPathname.value = '/acme/moonrise-studio/settings';
      render(<MenuShared config={settingsConfig} sectionLabel="Settings" />);
      expect(activeLabels()).toEqual(['Overview']);
    });

    it('activates Voice only — not the Overview root — on a brand sub-route', () => {
      mockPathname.value = '/acme/moonrise-studio/settings/voice';
      render(<MenuShared config={settingsConfig} sectionLabel="Settings" />);
      expect(activeLabels()).toEqual(['Voice']);
    });
  });

  it('routes the conversations new-thread CTA through the selected brand', () => {
    render(
      <MenuShared
        config={config}
        renderAfterNavigation={() => <div>thread-list</div>}
      />,
    );

    expect(screen.getByRole('link', { name: /New Thread/i })).toHaveAttribute(
      'href',
      '/acme/moonrise-studio/agent/new',
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
    const customBody = screen.getByTestId('custom-body');
    expect(customBody).toBeInTheDocument();
    expect(customBody.parentElement).toHaveClass('min-h-0');
    expect(customBody.parentElement).toHaveClass('overflow-hidden');
    expect(customBody.parentElement).not.toHaveClass('overflow-y-auto');
  });

  it('does not duplicate workspace context in the sidebar header', () => {
    mockBrandState.selectedBrand = { label: 'Acme Org' };

    render(<MenuShared config={config} />);

    const labels = screen.queryAllByText('Acme Org');
    expect(labels.length).toBeLessThanOrEqual(1);
  });

  it.each([
    { group: 'Settings', href: '/settings/models/all', label: 'Models' },
    { group: 'Insights', href: '/insights/overview', label: 'Overview' },
    { group: 'Content', href: '/content/posts', label: 'Posts' },
  ])(
    'routes to default nested page when clicking group drill-down row',
    ({ group, href, label }) => {
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
    },
  );
});
