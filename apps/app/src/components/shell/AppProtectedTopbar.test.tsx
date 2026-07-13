import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockSearchParams = new URLSearchParams();
const appSwitcherSpy = vi.hoisted(() => vi.fn());
const brandSwitcherSpy = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());
const mockPathname = vi.hoisted(() => ({
  value: '/acme/brand/workspace/overview',
}));
const mockAccessState = vi.hoisted(() => ({
  isSuperAdmin: false,
}));
const mockConversationShell = vi.hoisted(() => ({ enabled: false }));
const originalLocation = window.location;

vi.mock('@genfeedai/enums', () => ({
  ButtonSize: { ICON: 'icon' },
  ButtonVariant: { GHOST: 'ghost', UNSTYLED: 'unstyled' },
}));

vi.mock('@genfeedai/constants', () => ({
  APP_ROUTES: {
    WORKSPACE: {
      OVERVIEW: '/workspace/overview',
    },
  },
  createBrandAppRoute: (orgSlug: string, brandSlug: string, routePath = '/') =>
    `/${orgSlug}/${brandSlug}${routePath.startsWith('/') ? routePath : `/${routePath}`}`,
  createOrganizationAppRoute: (orgSlug: string, routePath = '/') =>
    `/${orgSlug}/~${routePath.startsWith('/') ? routePath : `/${routePath}`}`,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandSlug: 'brand',
    href: (nextHref: string) => nextHref,
    orgHref: (nextHref: string) => `/acme/~${nextHref.replace(/^\//, '')}`,
    orgSlug: 'acme',
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand',
    brands: [
      {
        id: 'brand',
        label: 'Acme Brand',
        organization: { id: 'org', slug: 'acme' },
        slug: 'brand',
      },
    ],
    selectedBrand: {
      id: 'brand',
      label: 'Acme Brand',
      organization: { id: 'org', slug: 'acme' },
      slug: 'brand',
    },
    setBrandId: vi.fn(),
    setOrganizationId: vi.fn(),
  }),
}));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => mockAccessState,
  }),
);

vi.mock('@/lib/workspace-shell/use-conversation-shell', () => ({
  useConversationShellEnabled: () => mockConversationShell.enabled,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    ariaLabel,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock('@ui/menus/switchers/MenuBrandSwitcher', () => ({
  default: (props: {
    brandId?: string;
    clearSelectionAction?: {
      ariaLabel?: string;
      onSelect: () => void;
    };
    variant?: string;
  }) => {
    brandSwitcherSpy(props);

    return (
      <div>
        <button type="button" data-testid="brand-switcher">
          {props.variant}:{props.brandId || 'none'}
        </button>
        {props.clearSelectionAction ? (
          <button
            type="button"
            data-testid="clear-brand-selection"
            aria-label={props.clearSelectionAction.ariaLabel}
            onClick={props.clearSelectionAction.onSelect}
          >
            clear
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock('@ui/shell/app-switcher/AppSwitcher', () => ({
  AppSwitcher: (props: {
    brandAwareSlug?: string;
    brandSlug?: string;
    currentApp?: string;
    orgSlug: string;
    preservedSearch?: string;
    resolveNavigation?: (href: string) => {
      announcement?: string;
      href: string;
    };
    showAdmin?: boolean;
    variant?: string;
  }) => {
    appSwitcherSpy(props);
    return <div data-testid="app-switcher">{props.variant}</div>;
  },
}));

vi.mock('@ui/topbars/credits-bar/TopbarCreditsBar', () => ({
  default: () => <div data-testid="topbar-credits-bar">Credits</div>,
}));

vi.mock('@ui/topbars/end/TopbarEnd', () => ({
  default: () => <div data-testid="topbar-end">Topbar End</div>,
}));

vi.mock('@/components/cloud-sync-indicator/CloudSyncIndicator', () => ({
  default: () => <div data-testid="cloud-sync-indicator" />,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

const { default: AppProtectedTopbar } = await import('./AppProtectedTopbar');

describe('AppProtectedTopbar', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockPathname.value = '/acme/brand/workspace/overview';
    mockAccessState.isSuperAdmin = false;
    mockConversationShell.enabled = false;
    appSwitcherSpy.mockClear();
    brandSwitcherSpy.mockClear();
    mockPush.mockClear();
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'localhost' },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
  });

  it('renders brand scope on the left, breadcrumb title in the middle, and controls on the right', () => {
    render(<AppProtectedTopbar orgSlug="acme" currentApp="studio" />);

    const brandSwitcher = screen.getByTestId('brand-switcher');
    const breadcrumbs = screen.getByRole('navigation', {
      name: 'Breadcrumb',
    });
    const switcher = screen.getByTestId('app-switcher');
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');
    const credits = screen.getByTestId('topbar-credits-bar');
    const topbarInner = screen.getByTestId('app-protected-topbar-inner');

    expect(topbarInner).toHaveClass('gap-2', 'pl-4', 'pr-6');
    expect(brandSwitcher).toHaveTextContent('labeled');
    expect(breadcrumbs).toHaveTextContent('Studio');
    expect(switcher).toHaveTextContent('icon');
    expect(switcher).toBeInTheDocument();
    expect(
      brandSwitcher.compareDocumentPosition(breadcrumbs) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      breadcrumbs.compareDocumentPosition(credits) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Credits are the first visible control in the right-side cluster.
    expect(
      credits.compareDocumentPosition(cloudSyncIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Cloud-sync sits before the grouped app-switcher/settings cluster.
    expect(
      cloudSyncIndicator.compareDocumentPosition(switcher) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('does not inject the context brand into explicit org-scoped routes', () => {
    render(<AppProtectedTopbar orgSlug="acme" currentApp="workspace" />);

    expect(appSwitcherSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        brandAwareSlug: 'brand',
        brandSlug: undefined,
        currentApp: 'workspace',
        orgSlug: 'acme',
      }),
    );
  });

  it('hides the brand switcher on organization settings routes', () => {
    mockPathname.value = '/acme/~/settings/api-keys';

    render(<AppProtectedTopbar orgSlug="acme" currentApp="workspace" />);

    expect(screen.queryByTestId('brand-switcher')).not.toBeInTheDocument();
    expect(appSwitcherSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        brandAwareSlug: 'brand',
        brandSlug: undefined,
        orgSlug: 'acme',
      }),
    );
  });

  it('passes an explicit brand route through to the app switcher', () => {
    render(
      <AppProtectedTopbar
        orgSlug="acme"
        brandSlug="brand"
        currentApp="workspace"
      />,
    );

    expect(appSwitcherSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        brandSlug: 'brand',
        currentApp: 'workspace',
        orgSlug: 'acme',
      }),
    );
  });

  it('renders admin chrome without brand, credits, account, or cloud controls', () => {
    render(
      <AppProtectedTopbar
        chrome="admin"
        orgSlug="acme"
        brandSlug="brand"
        currentApp="workspace"
      />,
    );

    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toHaveTextContent('Admin');
    expect(screen.getByTestId('app-switcher')).toHaveTextContent('icon');
    expect(appSwitcherSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        brandSlug: 'brand',
        currentApp: 'admin',
        orgSlug: 'acme',
        showAdmin: true,
      }),
    );
    expect(screen.queryByTestId('brand-switcher')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('cloud-sync-indicator'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('topbar-end')).not.toBeInTheDocument();
    expect(screen.queryByTestId('topbar-credits-bar')).not.toBeInTheDocument();
  });

  it('enables the admin app switcher item for platform admins', () => {
    mockAccessState.isSuperAdmin = true;

    render(<AppProtectedTopbar orgSlug="acme" currentApp="workspace" />);

    expect(appSwitcherSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        showAdmin: true,
      }),
    );
  });

  it('hides the admin app switcher item for non-admin users', () => {
    render(<AppProtectedTopbar orgSlug="acme" currentApp="workspace" />);

    expect(appSwitcherSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        showAdmin: false,
      }),
    );
  });

  it('launches switcher destinations through the trusted shell resolver', () => {
    mockConversationShell.enabled = true;
    mockSearchParams = new URLSearchParams([
      ['taskId', 'task-1'],
      ['taskSource', 'workspace'],
      ['thread', 'thread-1'],
    ]);

    render(
      <AppProtectedTopbar
        orgSlug="acme"
        brandSlug="brand"
        currentApp="agent"
      />,
    );

    const switcherProps = appSwitcherSpy.mock.lastCall?.[0] as {
      preservedSearch?: string;
      resolveNavigation?: (href: string) => {
        announcement?: string;
        href: string;
      };
    };

    expect(switcherProps.preservedSearch).toBe(
      'taskId=task-1&taskSource=workspace',
    );
    expect(
      switcherProps.resolveNavigation?.(
        '/acme/brand/analytics/overview?taskId=task-1',
      ),
    ).toEqual({
      announcement: 'Opening analytics in canvas mode.',
      href: '/acme/brand/analytics/overview?taskId=task-1&thread=thread-1',
    });
  });

  it('renders the cloud sync indicator beside the terminal dock control', () => {
    render(<AppProtectedTopbar isAgentCollapsed onAgentToggle={vi.fn()} />);

    const terminalButton = screen.getByRole('button', {
      name: 'Open terminal dock',
    });
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');

    expect(
      terminalButton.compareDocumentPosition(cloudSyncIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('does not infer SaaS mode from the hosted app hostname', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'app.genfeed.ai' },
      writable: true,
    });

    render(<AppProtectedTopbar isAgentCollapsed onAgentToggle={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Open terminal dock' }),
    ).toBeInTheDocument();
  });

  it('places credits first in the right-side control cluster', () => {
    render(<AppProtectedTopbar isAgentCollapsed onAgentToggle={vi.fn()} />);

    const terminalButton = screen.getByRole('button', {
      name: 'Open terminal dock',
    });
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');
    const switcher = screen.getByTestId('app-switcher');
    const topbarEnd = screen.getByTestId('topbar-end');
    const credits = screen.getByTestId('topbar-credits-bar');

    expect(
      credits.compareDocumentPosition(terminalButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      terminalButton.compareDocumentPosition(cloudSyncIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      cloudSyncIndicator.compareDocumentPosition(switcher) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      switcher.compareDocumentPosition(topbarEnd) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows task context with a scoped return link', () => {
    mockSearchParams = new URLSearchParams([
      ['taskId', 'task-1'],
      ['taskTitle', 'Launch plan'],
    ]);

    render(<AppProtectedTopbar />);

    expect(screen.getByText('Task context')).toBeInTheDocument();
    expect(screen.getByText('Launch plan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to task' })).toHaveAttribute(
      'href',
      '/workspace/overview?taskId=task-1',
    );
  });

  it('does not render a settings cog in the topbar (settings lives in the sidebar user menu)', () => {
    render(<AppProtectedTopbar />);

    expect(screen.queryByTitle('Settings')).not.toBeInTheDocument();
  });

  it('renders mobile close control and reserves space for the collapsed sidebar logo', () => {
    render(
      <AppProtectedTopbar
        isMenuOpen
        isSidebarCollapsed
        onMenuToggle={vi.fn()}
        onSidebarToggle={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Close navigation menu' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Expand sidebar' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('app-protected-topbar-inner')).toHaveClass(
      'pl-14',
    );
  });

  it('clears the visible brand on explicit organization routes', () => {
    render(<AppProtectedTopbar orgSlug="acme" currentApp="workspace" />);

    expect(brandSwitcherSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: '',
        clearSelectionAction: undefined,
      }),
    );
    expect(
      screen.queryByTestId('clear-brand-selection'),
    ).not.toBeInTheDocument();
  });

  it('shows the selected brand on explicit brand routes', () => {
    render(
      <AppProtectedTopbar
        orgSlug="acme"
        brandSlug="brand"
        currentApp="workspace"
      />,
    );

    expect(brandSwitcherSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand',
        clearSelectionAction: expect.objectContaining({
          ariaLabel: 'Clear brand selection',
        }),
      }),
    );
    expect(screen.getByTestId('clear-brand-selection')).toBeInTheDocument();
  });

  it('routes the clear-brand action to organization overview', () => {
    render(
      <AppProtectedTopbar
        orgSlug="acme"
        brandSlug="brand"
        currentApp="workspace"
      />,
    );

    fireEvent.click(screen.getByTestId('clear-brand-selection'));

    expect(mockPush).toHaveBeenCalledWith('/acme/~/overview');
  });
});
