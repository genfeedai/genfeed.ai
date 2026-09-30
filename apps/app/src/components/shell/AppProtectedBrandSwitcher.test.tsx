vi.mock('@/components/shell/NotificationInboxMenu', () => ({
  default: () => <div data-testid="notification-inbox" />,
}));

import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockSearchParams = new URLSearchParams();
const brandSwitcherSpy = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());
const mockPathname = vi.hoisted(() => ({
  value: '/acme/brand/workspace',
}));
const originalLocation = window.location;

// The constants barrel is mocked below, so the catalog-backed stub cannot load.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'clearBrandSelection' ? 'Clear brand selection' : key,
}));

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

const { default: AppProtectedBrandSwitcher } = await import(
  './AppProtectedBrandSwitcher'
);

const threadId = testId('thread');

describe('AppProtectedBrandSwitcher', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockPathname.value = '/acme/brand/workspace';
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

  it('renders the labeled brand switcher on brand routes', () => {
    render(<AppProtectedBrandSwitcher orgSlug="acme" brandSlug="brand" />);

    expect(screen.getByTestId('brand-switcher')).toHaveTextContent('labeled');
  });

  it('renders nothing in admin chrome', () => {
    render(
      <AppProtectedBrandSwitcher
        orgSlug="acme"
        brandSlug="brand"
        isAdminChrome
      />,
    );

    expect(screen.queryByTestId('brand-switcher')).not.toBeInTheDocument();
  });

  it('hides the brand switcher on organization settings routes', () => {
    mockPathname.value = '/acme/~/settings/api-keys';

    render(<AppProtectedBrandSwitcher orgSlug="acme" />);

    expect(screen.queryByTestId('brand-switcher')).not.toBeInTheDocument();
  });

  it('hides the brand switcher on every flat personal settings page even with a brand selected in session', () => {
    // Flat /settings/* pages carry no orgSlug/brandSlug route param — the
    // mocked useOrgUrl above still backfills brandSlug: 'brand' from the
    // session's last-selected brand, which is exactly the bug (#4659): the
    // switcher must key off the page itself, not that backfill.
    for (const pathname of [
      '/settings',
      '/settings/personal',
      '/settings/notifications',
      '/settings/progress',
      '/settings/help',
      '/settings/about',
    ]) {
      mockPathname.value = pathname;

      const { unmount } = render(<AppProtectedBrandSwitcher />);

      expect(screen.queryByTestId('brand-switcher')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('hides the brand switcher on every org-scoped copy of a personal settings page', () => {
    for (const pathname of [
      '/acme/~/settings/personal',
      '/acme/~/settings/notifications',
      '/acme/~/settings/progress',
      '/acme/~/settings/help',
    ]) {
      mockPathname.value = pathname;

      const { unmount } = render(<AppProtectedBrandSwitcher orgSlug="acme" />);

      expect(screen.queryByTestId('brand-switcher')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('does not hide the brand switcher on non-settings routes with no org/brand route param (#4659 review)', () => {
    // Before the fix, a route-param-derived "settings scope" evaluated
    // PERSONAL for ANY route with no orgSlug/brandSlug param — including `/`
    // and `/connect` — and wrongly hid the brand switcher there too.
    for (const pathname of ['/', '/connect']) {
      mockPathname.value = pathname;

      const { unmount } = render(<AppProtectedBrandSwitcher />);

      expect(screen.getByTestId('brand-switcher')).toBeInTheDocument();
      unmount();
    }
  });

  it('clears the visible brand on explicit organization routes', () => {
    render(<AppProtectedBrandSwitcher orgSlug="acme" />);

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
    render(<AppProtectedBrandSwitcher orgSlug="acme" brandSlug="brand" />);

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

  it('routes the clear-brand action to the org-scoped equivalent of the current surface', () => {
    mockPathname.value = '/acme/brand/agent/new';

    render(<AppProtectedBrandSwitcher orgSlug="acme" brandSlug="brand" />);

    fireEvent.click(screen.getByTestId('clear-brand-selection'));

    expect(mockPush).toHaveBeenCalledWith('/acme/~/agent/new');
  });

  it('starts an explicit brandless conversation when clearing a brand-owned thread', () => {
    mockPathname.value = `/acme/werwer/agent/${threadId}`;

    render(<AppProtectedBrandSwitcher orgSlug="acme" brandSlug="werwer" />);

    fireEvent.click(screen.getByTestId('clear-brand-selection'));

    expect(mockPush).toHaveBeenCalledWith('/acme/~/agent/new');
  });

  it('routes clear-brand from brand-only settings to the org brands hub', () => {
    mockPathname.value = '/acme/brand/settings/publishing';

    render(<AppProtectedBrandSwitcher orgSlug="acme" brandSlug="brand" />);

    fireEvent.click(screen.getByTestId('clear-brand-selection'));

    // No /:org/~/settings/publishing page — land on org brand management.
    expect(mockPush).toHaveBeenCalledWith('/acme/~/settings/brands');
  });

  it('keeps the agent surface when selecting a brand from an org-scoped route', () => {
    mockPathname.value = '/acme/~/agent/new';

    render(<AppProtectedBrandSwitcher orgSlug="acme" />);

    const onBrandChange = brandSwitcherSpy.mock.calls.at(-1)?.[0]
      ?.onBrandChange as ((id: string) => void) | undefined;
    expect(onBrandChange).toEqual(expect.any(Function));
    onBrandChange?.('brand');

    expect(mockPush).toHaveBeenCalledWith('/acme/brand/agent/new');
  });

  it('drops the selected conversation when switching brands', () => {
    mockPathname.value = `/acme/werwer/agent/${threadId}`;

    render(<AppProtectedBrandSwitcher orgSlug="acme" brandSlug="werwer" />);

    const onBrandChange = brandSwitcherSpy.mock.calls.at(-1)?.[0]
      ?.onBrandChange as ((id: string) => void) | undefined;
    onBrandChange?.('brand');

    expect(mockPush).toHaveBeenCalledWith('/acme/brand/agent/new');
  });
});
