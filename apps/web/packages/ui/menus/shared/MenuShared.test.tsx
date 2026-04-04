import type { MenuConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuShellConfig } from '@props/navigation/menu.props';
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

// @clerk/nextjs is already mocked globally in setup.ts
// Add UserButton that's not in the global mock
vi.mock('@clerk/nextjs', () => {
  return {
    ClerkProvider: ({ children }: { children: React.ReactNode }) => (
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

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: null,
    brands: [],
    selectedBrand: mockBrandState.selectedBrand,
  }),
}));

vi.mock('@contexts/ui/sidebar-navigation-context', () => ({
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

vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => mockLogoUrl.value,
}));

vi.mock('@hooks/data/overview/use-overview-bootstrap', () => ({
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

vi.mock('@ui/menus/organization-switcher/OrganizationSwitcher', () => ({
  default: () => <div data-testid="organization-switcher" />,
}));

vi.mock('@ui/menus/sidebar-brand-rail/SidebarBrandRail', () => ({
  default: () => <div data-testid="sidebar-brand-rail-content" />,
}));

vi.mock('@ui/cards/progress-sidebar-card/ProgressSidebarCard', () => ({
  default: () => <div data-testid="progress-sidebar-card" />,
}));

vi.mock('@services/core/environment.service', () => ({
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

  it('renders the sidebar header shell', () => {
    render(<MenuShared config={config} />);

    expect(screen.getByTestId('sidebar-header-shell')).toBeInTheDocument();
  });

  it('renders a top slot below the header when provided', () => {
    render(
      <MenuShared
        config={config}
        renderTopSlot={() => <div data-testid="sidebar-top-slot">Search</div>}
      />,
    );

    const topSlot = screen.getByTestId('sidebar-top-slot');
    const header = screen.getByTestId('sidebar-header-shell');
    const firstMenuItem = screen.getByText('Dashboard');

    expect(topSlot).toBeInTheDocument();
    expect(
      header.compareDocumentPosition(topSlot) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      topSlot.compareDocumentPosition(firstMenuItem) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the workspace shell rail and org chip when enabled', () => {
    const workspaceConfig: MenuShellConfig = {
      brandRailMode: 'workspace',
      items: [
        {
          href: '/workspace/overview',
          label: 'Dashboard',
        },
      ],
      logoHref: '/',
      showOrganizationSwitcher: true,
    };

    render(<MenuShared config={workspaceConfig} />);

    expect(screen.getByTestId('sidebar-brand-rail')).toBeInTheDocument();
    expect(
      screen.getByTestId('sidebar-brand-rail-content'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('organization-switcher')).toBeInTheDocument();
    expect(
      screen.queryByTestId('sidebar-header-shell'),
    ).not.toBeInTheDocument();
  });

  it('attaches the actionable inbox count to the workspace inbox row', () => {
    const workspaceConfig: MenuShellConfig = {
      brandRailMode: 'workspace',
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

    render(<MenuShared config={workspaceConfig} />);

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
    expect(screen.getByText('⌘N')).toBeInTheDocument();
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
    expect(screen.getByText('Inbox')).toBeInTheDocument();
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

  it('routes the conversations new chat CTA directly to /chat/new', () => {
    render(
      <MenuShared
        config={config}
        renderAfterNavigation={() => <div>thread-list</div>}
      />,
    );

    expect(screen.getByRole('link', { name: /New Chat/i })).toHaveAttribute(
      'href',
      '/acme/moonrise-studio/chat/new',
    );
  });

  it('does not add an extra inner horizontal gutter around the new chat row', () => {
    render(
      <MenuShared
        config={config}
        renderAfterNavigation={() => <div>thread-list</div>}
      />,
    );

    expect(
      screen.getByRole('link', { name: /New Chat/i }).parentElement,
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

  it('renders the consolidated progress module in the default sidebar body', () => {
    render(<MenuShared config={config} />);

    expect(screen.getByTestId('progress-sidebar-card')).toBeInTheDocument();
  });

  it('can hide primary CTA when rendering contextual sidebar content', () => {
    const primaryConfig: MenuConfig = {
      items: [
        {
          href: '/chat',
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

  it('shows the Genfeed mark in the toggle button when expanded', () => {
    mockLogoUrl.value = '/logo.svg';

    render(
      <MenuShared
        config={config}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );

    expect(screen.getByAltText('Genfeed')).toBeInTheDocument();
  });

  it('keeps default sidebar header chrome styling', () => {
    render(<MenuShared config={config} />);

    expect(screen.getByTestId('sidebar-header-shell')).toHaveClass('border-b');
  });

  it('removes sidebar header chrome styling for transparent shell variant', () => {
    render(<MenuShared config={config} shellChromeVariant="transparent" />);

    const headerShell = screen.getByTestId('sidebar-header-shell');

    expect(headerShell).toHaveClass('h-16', 'items-center', 'gap-2');
    expect(headerShell).not.toHaveClass('border-b');
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
  ])('routes to default nested page when clicking $group drill-down row', ({
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
