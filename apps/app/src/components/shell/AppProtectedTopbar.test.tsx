vi.mock('@/components/shell/NotificationInboxMenu', () => ({
  default: () => <div data-testid="notification-inbox" />,
}));
vi.mock('@/components/shell/GenerationToasts', () => ({
  default: () => null,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockSearchParams = new URLSearchParams();
const brandSwitcherSpy = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());
const mockPathname = vi.hoisted(() => ({
  value: '/acme/brand/workspace',
}));
const workspaceInspectorState = vi.hoisted(() => ({
  value: null as {
    isMobileOpen: boolean;
    isOpen: boolean;
    isRegistered: boolean;
    setIsMobileOpen: (isMobileOpen: boolean) => void;
    toggle: () => void;
  } | null,
}));
const originalLocation = window.location;

vi.mock('@genfeedai/contracts', () => ({
  ButtonSize: { ICON: 'icon' },
  ButtonVariant: { GHOST: 'ghost', UNSTYLED: 'unstyled' },
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
  useOrgUrl: () => ({
    brandSlug: 'brand',
    href: (nextHref: string) => nextHref,
    orgHref: (nextHref: string) => `/acme/~${nextHref.replace(/^\//, '')}`,
    orgSlug: 'acme',
  }),
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
    setBrandId: vi.fn(),
    setOrganizationId: vi.fn(),
  }),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    ariaLabel,
    className,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    className?: string;
  } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/workspace-shell/WorkspaceInspectorContext', () => ({
  useWorkspaceInspector: () => workspaceInspectorState.value,
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

vi.mock('@ui/topbars/credits-bar/TopbarCreditsBar', () => ({
  default: () => <div data-testid="topbar-credits-bar">Credits</div>,
}));

vi.mock('@/components/cloud-sync-indicator/CloudSyncIndicator', () => ({
  default: () => <div data-testid="cloud-sync-indicator" />,
}));

vi.mock('@/components/shell/TopbarActivityMenu', () => ({
  default: () => <div data-testid="topbar-activity-menu" />,
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt?: string; src?: string }) => (
    <img alt={alt} src={src} />
  ),
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
    mockPathname.value = '/acme/brand/workspace';
    workspaceInspectorState.value = null;
    brandSwitcherSpy.mockClear();
    brandContextState.brands = [
      {
        id: 'brand',
        label: 'Acme Brand',
        organization: { id: 'org', slug: 'acme' },
        slug: 'brand',
      },
    ];
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

  it('carries only the page identity and actions, never the brand or org', () => {
    render(<AppProtectedTopbar orgSlug="acme" currentApp="studio" />);

    const breadcrumbs = screen.getByRole('navigation', {
      name: 'Breadcrumb',
    });
    const activityMenu = screen.getByTestId('notification-inbox');
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');
    const credits = screen.getByTestId('topbar-credits-bar');
    const topbarInner = screen.getByTestId('app-protected-topbar-inner');

    // The brand switcher is the sidebar header; the org is on the app rail.
    expect(screen.queryByTestId('brand-switcher')).not.toBeInTheDocument();
    expect(topbarInner).toHaveClass('gap-3', 'px-3');
    expect(breadcrumbs).toHaveTextContent('Studio');
    expect(
      breadcrumbs.compareDocumentPosition(credits) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Credits are the first visible control in the right-side cluster.
    expect(
      credits.compareDocumentPosition(activityMenu) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      activityMenu.compareDocumentPosition(cloudSyncIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('leaves app navigation to the rail', () => {
    render(<AppProtectedTopbar orgSlug="acme" currentApp="studio" />);

    expect(
      screen.queryByRole('button', { name: 'Switch app' }),
    ).not.toBeInTheDocument();
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
    expect(screen.queryByTestId('brand-switcher')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('topbar-activity-menu'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('cloud-sync-indicator'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('topbar-credits-bar')).not.toBeInTheDocument();
  });

  it('places credits first in the right-side control cluster', () => {
    render(<AppProtectedTopbar />);

    const activityMenu = screen.getByTestId('notification-inbox');
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');
    const credits = screen.getByTestId('topbar-credits-bar');

    expect(
      credits.compareDocumentPosition(activityMenu) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      activityMenu.compareDocumentPosition(cloudSyncIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('does not render a settings cog in the topbar (settings lives in the sidebar user menu)', () => {
    render(<AppProtectedTopbar />);

    expect(screen.queryByTitle('Settings')).not.toBeInTheDocument();
  });

  it('renders separate mobile and desktop navigation controls', () => {
    const onSidebarToggle = vi.fn();

    render(
      <AppProtectedTopbar
        isMenuOpen
        isSidebarCollapsed
        onMenuToggle={vi.fn()}
        onSidebarToggle={onSidebarToggle}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Close navigation menu' }),
    ).toBeInTheDocument();
    const expandToggle = screen.getByRole('button', {
      name: 'Expand sidebar',
    });
    const logo = expandToggle.querySelector('img');

    expect(expandToggle).toBeInTheDocument();
    expect(logo?.getAttribute('src')).toContain('logo.svg');
    expect(logo?.parentElement).toHaveClass('group-hover:opacity-0');
    expect(expandToggle.querySelector('svg')?.parentElement).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
    );
    expect(screen.getByTestId('app-protected-topbar-inner')).not.toHaveClass(
      'pl-14',
    );

    fireEvent.click(expandToggle);
    expect(onSidebarToggle).toHaveBeenCalledTimes(1);
  });

  it('leaves the expanded sidebar control in the unified sidebar header', () => {
    render(<AppProtectedTopbar onSidebarToggle={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' }),
    ).not.toBeInTheDocument();
  });

  it('does not mount a topbar account menu when the sidebar is collapsed', () => {
    const { container } = render(
      <AppProtectedTopbar
        isSidebarCollapsed
        onMenuToggle={vi.fn()}
        onSidebarToggle={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('topbar-account-menu')).toBeNull();
    expect(
      container.querySelector('[data-testid="user-dropdown-trigger"]'),
    ).toBeNull();
  });

  it('exposes the inspector toggle as a controlled disclosure', () => {
    const toggle = vi.fn();
    workspaceInspectorState.value = {
      isMobileOpen: false,
      isOpen: true,
      isRegistered: true,
      setIsMobileOpen: vi.fn(),
      toggle,
    };

    render(<AppProtectedTopbar />);

    const inspectorToggle = screen.getByTestId('topbar-inspector-toggle');
    expect(inspectorToggle).toHaveAccessibleName(
      'Collapse workspace inspector',
    );
    expect(inspectorToggle).toHaveAttribute(
      'aria-controls',
      'workspace-context-inspector',
    );
    expect(inspectorToggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(inspectorToggle);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('opens the inspector drawer from the below-xl toggle variant', () => {
    const setIsMobileOpen = vi.fn();
    workspaceInspectorState.value = {
      isMobileOpen: false,
      isOpen: true,
      isRegistered: true,
      setIsMobileOpen,
      toggle: vi.fn(),
    };

    render(<AppProtectedTopbar />);

    const drawerToggle = screen.getByTestId('topbar-inspector-drawer-toggle');
    expect(drawerToggle).toHaveAccessibleName('Open workspace inspector');
    expect(drawerToggle).toHaveAttribute(
      'aria-controls',
      'workspace-context-inspector-drawer',
    );
    expect(drawerToggle).toHaveAttribute('aria-expanded', 'false');
    // The two variants split by viewport: rail toggle at xl+, drawer below.
    expect(screen.getByTestId('topbar-inspector-toggle').className).toContain(
      'xl:inline-flex',
    );
    expect(drawerToggle.className).toContain('xl:hidden');

    fireEvent.click(drawerToggle);
    expect(setIsMobileOpen).toHaveBeenCalledWith(true);
  });

  it('toggles the inspector drawer closed when it is already open', () => {
    const setIsMobileOpen = vi.fn();
    workspaceInspectorState.value = {
      isMobileOpen: true,
      isOpen: true,
      isRegistered: true,
      setIsMobileOpen,
      toggle: vi.fn(),
    };

    render(<AppProtectedTopbar />);

    const drawerToggle = screen.getByTestId('topbar-inspector-drawer-toggle');
    expect(drawerToggle).toHaveAccessibleName('Close workspace inspector');
    expect(drawerToggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(drawerToggle);
    expect(setIsMobileOpen).toHaveBeenCalledWith(false);
  });
});
