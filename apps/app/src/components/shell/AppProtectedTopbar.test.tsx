import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockSearchParams = new URLSearchParams();
const appSwitcherSpy = vi.hoisted(() => vi.fn());
const mockAccessState = vi.hoisted(() => ({
  isSuperAdmin: false,
}));
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
  default: ({ variant }: { variant?: string }) => (
    <div data-testid="brand-switcher">{variant}</div>
  ),
}));

vi.mock('@ui/shell/app-switcher/AppSwitcher', () => ({
  AppSwitcher: (props: {
    brandSlug?: string;
    currentApp?: string;
    orgSlug: string;
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
  usePathname: () => '/acme/brand/workspace/overview',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

const { default: AppProtectedTopbar } = await import('./AppProtectedTopbar');

describe('AppProtectedTopbar', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockAccessState.isSuperAdmin = false;
    appSwitcherSpy.mockClear();
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

    expect(brandSwitcher).toHaveTextContent('labeled');
    expect(breadcrumbs).toHaveTextContent('Studio');
    expect(switcher).toHaveTextContent('icon');
    expect(switcher).toBeInTheDocument();
    expect(
      brandSwitcher.compareDocumentPosition(breadcrumbs) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      breadcrumbs.compareDocumentPosition(cloudSyncIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Cloud-sync sits before the grouped app-switcher/settings cluster.
    expect(
      cloudSyncIndicator.compareDocumentPosition(switcher) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Credits are pinned to the far right, after the app-switcher cluster.
    expect(
      switcher.compareDocumentPosition(credits) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('does not inject the context brand into explicit org-scoped routes', () => {
    render(<AppProtectedTopbar orgSlug="acme" currentApp="workspace" />);

    expect(appSwitcherSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        brandSlug: undefined,
        currentApp: 'workspace',
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

  it('does not render the terminal dock control on the hosted app hostname', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'app.genfeed.ai' },
      writable: true,
    });

    render(<AppProtectedTopbar isAgentCollapsed onAgentToggle={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Open terminal dock' }),
    ).not.toBeInTheDocument();
  });

  it('groups the app switcher beside the settings menu and pins credits to the far right', () => {
    render(<AppProtectedTopbar />);

    const switcher = screen.getByTestId('app-switcher');
    const topbarEnd = screen.getByTestId('topbar-end');
    const credits = screen.getByTestId('topbar-credits-bar');

    // App switcher renders immediately before the settings/user menu so they
    // read as one grouped cluster.
    expect(
      switcher.compareDocumentPosition(topbarEnd) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Credits render after the settings menu, at the far right of the bar.
    expect(
      topbarEnd.compareDocumentPosition(credits) &
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

  it('renders close and expand controls for open mobile menu and collapsed sidebar', () => {
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
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeInTheDocument();
  });
});
