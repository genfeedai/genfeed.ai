vi.mock('@/components/shell/NotificationInboxMenu', () => ({
  default: () => <div data-testid="notification-inbox" />,
}));
vi.mock('@/components/shell/GenerationToasts', () => ({
  default: () => null,
}));

import { render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockSearchParams = new URLSearchParams();
const brandSwitcherSpy = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());
const mockPathname = vi.hoisted(() => ({
  value: '/acme/brand/workspace',
}));
const agentDockState = vi.hoisted(() => ({
  value: null as {
    isAvailable: boolean;
    isOpen: boolean;
    toggle: () => void;
  } | null,
}));
const contextSidebarState = vi.hoisted(() => ({
  value: null as {
    isMobileOpen: boolean;
    isOpen: boolean;
    selection: { id: string; kind: 'asset'; title: string } | null;
    setIsMobileOpen: (isMobileOpen: boolean) => void;
    toggle: () => void;
  } | null,
}));
const originalLocation = window.location;

vi.mock('@genfeedai/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/contracts')>()),
  ButtonSize: { ICON: 'icon' },
  ButtonVariant: { GHOST: 'ghost', UNSTYLED: 'unstyled' },
  SettingsSurface: {
    BRAND: 'brand',
    ORGANIZATION: 'organization',
    PERSONAL: 'personal',
  },
}));

vi.mock('@genfeedai/contracts/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/contracts/constants')>()),
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
    isDisabled,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    className?: string;
    isDisabled?: boolean;
  } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
      disabled={isDisabled}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('@contexts/ui/agent-dock-context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@contexts/ui/agent-dock-context')>();
  return {
    ...actual,
    useAgentDock: () => agentDockState.value,
  };
});

vi.mock('@contexts/ui/context-sidebar-context', () => ({
  useContextSidebar: () => contextSidebarState.value,
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    (
      ({
        'common.agentDock': {
          close: 'Close agent',
          open: 'Open agent',
          unavailable: 'Agent is the main view here',
        },
        'common.sidebar': {
          collapse: 'Collapse sidebar',
        },
        'common.contextSidebar': {
          close: 'Close details',
          collapse: 'Collapse details',
          empty: 'Select an item to see details',
          expand: 'Expand details',
          open: 'Open details',
        },
      }) as Record<string, Record<string, string>>
    )[namespace]?.[key] ?? key,
}));

vi.mock('@ui/menus/organization-switcher/OrganizationSwitcher', () => ({
  default: () => (
    <button type="button" data-testid="organization-switcher">
      Organization
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
    contextSidebarState.value = null;
    agentDockState.value = null;
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

  it('leads with the brand switcher and a left-aligned breadcrumb', () => {
    render(
      <AppProtectedTopbar
        orgSlug="acme"
        brandSlug="brand"
        currentApp="studio"
      />,
    );

    const brand = screen.getByTestId('brand-switcher');
    const breadcrumbs = screen.getByRole('navigation', {
      name: 'Breadcrumb',
    });
    const activityMenu = screen.getByTestId('notification-inbox');
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');
    const credits = screen.getByTestId('topbar-credits-bar');
    const topbarInner = screen.getByTestId('app-protected-topbar-inner');

    expect(topbarInner).toHaveClass('gap-1', 'px-2', 'md:gap-3', 'md:px-3');
    expect(topbarInner).not.toHaveClass('justify-center');
    expect(breadcrumbs).toHaveTextContent('Studio');
    expect(
      brand.compareDocumentPosition(breadcrumbs) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  it('keeps the mobile menu in the topbar and the mark out of it', () => {
    render(<AppProtectedTopbar isMenuOpen onMenuToggle={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Close navigation menu' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Expand sidebar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('app-protected-topbar-inner')).not.toHaveClass(
      'pl-14',
    );
  });

  it('puts organization, brand, then the breadcrumb', () => {
    render(<AppProtectedTopbar brandSlug="brand" orgSlug="acme" />);

    const organization = screen.getByTestId('organization-switcher');
    const brand = screen.getByTestId('brand-switcher');
    const breadcrumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });

    expect(
      organization.compareDocumentPosition(brand) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      brand.compareDocumentPosition(breadcrumbs) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' }),
    ).not.toBeInTheDocument();
  });

  it('does not mount a topbar account menu when the sidebar is collapsed', () => {
    const { container } = render(<AppProtectedTopbar onMenuToggle={vi.fn()} />);

    expect(screen.queryByTestId('topbar-account-menu')).toBeNull();
    expect(
      container.querySelector('[data-testid="user-dropdown-trigger"]'),
    ).toBeNull();
  });

  function selectAsset(
    overrides: Partial<NonNullable<typeof contextSidebarState.value>> = {},
  ) {
    const state = {
      isMobileOpen: false,
      isOpen: true,
      selection: {
        id: 'asset-1',
        kind: 'asset' as const,
        title: 'Launch still',
      },
      setIsMobileOpen: vi.fn(),
      toggle: vi.fn(),
      ...overrides,
    };
    contextSidebarState.value = state;
    return state;
  }

  it('keeps the details toggle out of the window topbar', () => {
    selectAsset();

    render(<AppProtectedTopbar />);

    expect(screen.queryByTestId('topbar-inspector-toggle')).toBeNull();
    expect(screen.queryByTestId('topbar-inspector-drawer-toggle')).toBeNull();
  });

  it('hides the agent dock toggle while split chrome is hidden', () => {
    const toggle = vi.fn();
    agentDockState.value = { isAvailable: true, isOpen: false, toggle };

    render(<AppProtectedTopbar />);

    expect(screen.queryByTestId('topbar-agent-dock-toggle')).toBeNull();
  });

  it('keeps the agent dock toggle hidden when the dock is unavailable', () => {
    agentDockState.value = {
      isAvailable: false,
      isOpen: false,
      toggle: vi.fn(),
    };

    render(<AppProtectedTopbar />);

    expect(screen.queryByTestId('topbar-agent-dock-toggle')).toBeNull();
  });
});
