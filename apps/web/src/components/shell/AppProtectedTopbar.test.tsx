vi.mock('@/components/shell/NotificationInboxMenu', () => ({
  default: () => <div data-testid="notification-inbox" />,
}));
vi.mock('@/components/shell/GenerationToasts', () => ({
  default: () => null,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import {
  type ButtonHTMLAttributes,
  cloneElement,
  isValidElement,
  type ReactNode,
} from 'react';
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
    panel?: {
      activeView: 'agent' | 'details' | 'history' | null;
      canShowContext: boolean;
      close: () => void;
      selectView: (view: 'agent' | 'details' | 'history') => void;
    } | null;
    toggle: () => void;
  } | null,
}));
const contextSidebarState = vi.hoisted(() => ({
  value: null as {
    isMobileOpen: boolean;
    isOpen: boolean;
    reveal: () => void;
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
    playground: 'Playground',
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
    APPS: {
      ROOT: '/apps',
    },
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
    asChild,
    children,
    onClick,
    ariaLabel,
    className,
    isDisabled,
    ...props
  }: {
    asChild?: boolean;
    children: ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    className?: string;
    isDisabled?: boolean;
  } & ButtonHTMLAttributes<HTMLButtonElement>) => {
    if (asChild && isValidElement<{ className?: string }>(children)) {
      const {
        size: _size,
        tooltip: _tooltip,
        variant: _variant,
        withWrapper: _withWrapper,
        ...slotProps
      } = props as Record<string, unknown>;
      return cloneElement(children, {
        ...slotProps,
        className: [className, children.props.className]
          .filter(Boolean)
          .join(' '),
      });
    }

    return (
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
    );
  },
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
        'common.apps': { title: 'Apps', breadcrumbLabel: 'Breadcrumb' },
        'common.appRail': {
          launcher: 'Apps',
        },
        'common.agentDock': {
          close: 'Close agent',
          open: 'Open agent',
          unavailable: 'Agent is the main view here',
        },
        'common.sidebar': {
          collapse: 'Collapse sidebar',
        },
        'common.sidePanel': {
          closeContext: 'Close context',
          openContext: 'Open context',
        },
      }) as Record<string, Record<string, string>>
    )[namespace]?.[key] ?? key,
}));

vi.mock(
  '@/components/menus/organization-switcher/OrganizationSwitcher',
  () => ({
    default: () => (
      <button type="button" data-testid="organization-switcher">
        Organization
      </button>
    ),
  }),
);

vi.mock('@/components/menus/switchers/MenuBrandSwitcher', () => ({
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

vi.mock('@/components/topbars/credits-bar/CreditsLiveSync', () => ({
  default: () => <span data-testid="credits-live-sync" />,
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
        currentApp="playground"
      />,
    );

    const brand = screen.getByTestId('brand-switcher');
    const breadcrumbs = screen.getByRole('navigation', {
      name: 'Breadcrumb',
    });
    const activityMenu = screen.getByTestId('notification-inbox');
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');
    const topbarInner = screen.getByTestId('app-protected-topbar-inner');

    expect(topbarInner).toHaveClass('gap-1', 'px-2', 'md:gap-3', 'md:px-3');
    expect(topbarInner).not.toHaveClass('justify-center');
    expect(breadcrumbs).toHaveTextContent('Playground');
    expect(
      brand.compareDocumentPosition(breadcrumbs) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      breadcrumbs.compareDocumentPosition(activityMenu) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      activityMenu.compareDocumentPosition(cloudSyncIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('links Apps to the app catalog, right before the activity menu', () => {
    render(<AppProtectedTopbar orgSlug="acme" brandSlug="brand" />);

    const apps = screen.getByRole('link', { name: 'Apps' });
    const activityMenu = screen.getByTestId('notification-inbox');

    expect(apps).toHaveAttribute('href', '/acme/~/apps');
    expect(apps).toHaveAttribute('data-testid', 'topbar-apps-link');
    expect(apps).not.toHaveAttribute('aria-current');
    expect(
      apps.compareDocumentPosition(activityMenu) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('marks the Apps link as current on its page', () => {
    mockPathname.value = '/acme/~/apps';

    render(<AppProtectedTopbar orgSlug="acme" brandSlug="brand" />);

    expect(screen.getByRole('link', { name: 'Apps' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows a single Apps breadcrumb with organization selection and no brand selector', () => {
    mockPathname.value = '/acme/~/apps';
    render(<AppProtectedTopbar orgSlug="acme" currentApp="workspace" />);
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toHaveTextContent(/^Apps$/);
    expect(screen.queryByTestId('brand-switcher')).toBeNull();
  });

  it('leaves app navigation to the rail', () => {
    render(<AppProtectedTopbar orgSlug="acme" currentApp="playground" />);

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
    expect(screen.queryByTestId('credits-live-sync')).not.toBeInTheDocument();
    expect(screen.queryByTestId('topbar-apps-link')).not.toBeInTheDocument();
  });

  it('keeps the wallet synced but shows no credit balance in the topbar', () => {
    render(<AppProtectedTopbar />);

    const activityMenu = screen.getByTestId('notification-inbox');
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');

    expect(screen.getByTestId('credits-live-sync')).toBeInTheDocument();
    expect(screen.queryByTestId('topbar-credits-trigger')).toBeNull();
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
      reveal: vi.fn(),
      setIsMobileOpen: vi.fn(),
      toggle: vi.fn(),
      ...overrides,
    };
    contextSidebarState.value = state;
    return state;
  }

  it('opens the selection from the Context toggle when no shell panel exists', () => {
    const state = selectAsset({ isOpen: false });

    render(<AppProtectedTopbar chrome="admin" />);

    const button = screen.getByTestId('topbar-context-toggle');
    expect(button).toHaveAccessibleName('Open context');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(state.reveal).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('topbar-agent-dock-toggle')).toBeNull();
  });

  it('closes the selection from the Context toggle on desktop and in the drawer', () => {
    const state = selectAsset();
    const { rerender } = render(<AppProtectedTopbar chrome="admin" />);

    const button = screen.getByTestId('topbar-context-toggle');
    expect(button).toHaveAccessibleName('Close context');
    fireEvent.click(button);
    expect(state.toggle).toHaveBeenCalledTimes(1);

    const drawerState = selectAsset({ isMobileOpen: true, isOpen: false });
    rerender(<AppProtectedTopbar chrome="admin" />);
    fireEvent.click(screen.getByTestId('topbar-context-toggle'));
    expect(drawerState.setIsMobileOpen).toHaveBeenCalledWith(false);
  });

  it('shows no panel toggles in admin without a selection', () => {
    render(<AppProtectedTopbar chrome="admin" />);

    expect(screen.queryByTestId('topbar-panel-toggles')).toBeNull();
  });

  it('drives the shell panel from Chat and Context, with History under Chat', () => {
    const panel = {
      activeView: 'agent' as 'agent' | 'details' | 'history' | null,
      canShowContext: true,
      close: vi.fn(),
      selectView: vi.fn(),
    };
    agentDockState.value = {
      isAvailable: true,
      isOpen: true,
      panel,
      toggle: vi.fn(),
    };

    const { rerender } = render(<AppProtectedTopbar />);

    const chat = screen.getByTestId('topbar-agent-dock-toggle');
    const context = screen.getByTestId('topbar-context-toggle');
    expect(chat).toHaveAttribute('aria-expanded', 'true');
    expect(context).toHaveAttribute('aria-expanded', 'false');
    expect(context).toHaveAccessibleName('Open context');

    fireEvent.click(context);
    expect(panel.selectView).toHaveBeenCalledWith('details');
    fireEvent.click(chat);
    expect(panel.close).toHaveBeenCalledTimes(1);

    agentDockState.value = {
      ...agentDockState.value,
      panel: { ...panel, activeView: 'details' },
    };
    rerender(<AppProtectedTopbar />);
    expect(screen.getByTestId('topbar-context-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('topbar-agent-dock-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    fireEvent.click(screen.getByTestId('topbar-agent-dock-toggle'));
    expect(panel.selectView).toHaveBeenCalledWith('agent');

    agentDockState.value = {
      ...agentDockState.value,
      panel: { ...panel, activeView: 'history' },
    };
    rerender(<AppProtectedTopbar />);
    expect(screen.getByTestId('topbar-agent-dock-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('hides Context where the shell has nothing to show', () => {
    agentDockState.value = {
      isAvailable: false,
      isOpen: false,
      panel: {
        activeView: null,
        canShowContext: false,
        close: vi.fn(),
        selectView: vi.fn(),
      },
      toggle: vi.fn(),
    };

    render(<AppProtectedTopbar />);

    expect(screen.queryByTestId('topbar-context-toggle')).toBeNull();
    expect(screen.queryByTestId('topbar-agent-dock-toggle')).toBeNull();
  });

  it('toggles the agent panel from the topbar', () => {
    const toggle = vi.fn();
    agentDockState.value = { isAvailable: true, isOpen: false, toggle };

    render(<AppProtectedTopbar />);

    const button = screen.getByTestId('topbar-agent-dock-toggle');
    expect(button).toHaveAccessibleName('Open agent');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('shows the agent panel toggle as open while the panel is open', () => {
    agentDockState.value = {
      isAvailable: true,
      isOpen: true,
      toggle: vi.fn(),
    };

    render(<AppProtectedTopbar />);

    const button = screen.getByTestId('topbar-agent-dock-toggle');
    expect(button).toHaveAccessibleName('Close agent');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('hides the agent panel toggle when the dock is unavailable', () => {
    agentDockState.value = {
      isAvailable: false,
      isOpen: false,
      toggle: vi.fn(),
    };

    render(<AppProtectedTopbar />);

    expect(screen.queryByTestId('topbar-agent-dock-toggle')).toBeNull();
  });
});
