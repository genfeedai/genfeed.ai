// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: { isSuperAdmin: false },
  brand: {
    selectedBrand: { slug: 'moonrise' } as { slug?: string } | undefined,
    settings: {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      moduleOverrides: {},
    } as Record<string, unknown> | null,
    settingsLoading: false,
  },
  flags: {} as Record<string, unknown>,
  install: vi.fn(),
  installed: {
    installedAppIds: ['playground'] as string[],
    pendingAppIds: [] as string[],
    status: 'ready' as 'loading' | 'ready' | 'error',
  },
  uninstall: vi.fn(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brand,
}));
vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({ useAccessState: () => mocks.access }),
);
vi.mock('@genfeedai/hooks/feature-flags/provider', () => ({
  useFeatureFlagContext: () => ({ flags: mocks.flags, isConfigured: false }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgSlug: 'acme' }),
}));
vi.mock('@/components/shell/installed-apps.provider', () => ({
  useInstalledApps: () => ({
    ...mocks.installed,
    install: mocks.install,
    uninstall: mocks.uninstall,
  }),
}));
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/~/store',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const { default: OrganizationStorePage } = await import(
  './OrganizationStorePage'
);

function card(appId: string): HTMLElement {
  return screen.getByTestId(`store-app-${appId}`);
}

function appState(appId: string): string | null | undefined {
  return card(appId)
    .querySelector('[data-app-state]')
    ?.getAttribute('data-app-state');
}

describe('OrganizationStorePage (#5502)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.isSuperAdmin = false;
    mocks.brand.selectedBrand = { slug: 'moonrise' };
    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      moduleOverrides: {},
    };
    mocks.brand.settingsLoading = false;
    mocks.flags = {};
    mocks.installed.installedAppIds = ['playground'];
    mocks.installed.pendingAppIds = [];
    mocks.installed.status = 'ready';
    mocks.install.mockResolvedValue(true);
    mocks.uninstall.mockResolvedValue(true);
  });

  it('lists released apps for customers and omits founder-only experiments', () => {
    render(<OrganizationStorePage />);

    expect(
      screen
        .getAllByTestId(/^store-app-/)
        .map((element) => element.dataset.testid),
    ).toEqual([
      'store-app-playground',
      'store-app-storyboard',
      'store-app-turbo',
      'store-app-discovery',
    ]);
  });

  it('lists every native app for the founder', () => {
    mocks.access.isSuperAdmin = true;
    render(<OrganizationStorePage />);

    expect(screen.getAllByTestId(/^store-app-/)).toHaveLength(9);
  });

  it('opens an installed app and installs one that is not installed', async () => {
    const user = userEvent.setup();
    render(<OrganizationStorePage />);

    expect(
      within(card('playground')).getByRole('link', { name: 'Open' }),
    ).toHaveAttribute('href', '/acme/moonrise/studio/playground');
    await user.click(
      within(card('storyboard')).getByRole('button', {
        name: 'Install Storyboard',
      }),
    );
    expect(mocks.install).toHaveBeenCalledWith('storyboard');
  });

  it('explains a failed install without showing the app as installed', async () => {
    mocks.install.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<OrganizationStorePage />);

    await user.click(
      within(card('storyboard')).getByRole('button', {
        name: 'Install Storyboard',
      }),
    );
    await waitFor(() =>
      expect(within(card('storyboard')).getByRole('alert')).toHaveTextContent(
        "Couldn't install Storyboard. Try again.",
      ),
    );
    expect(appState('storyboard')).toBe('not-installed');
  });

  it('shows truthful locked states instead of an install', () => {
    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: false,
      moduleOverrides: { batch: false },
    };
    render(<OrganizationStorePage />);

    expect(appState('turbo')).toBe('organization-disabled');
    expect(within(card('turbo')).queryByRole('button')).toBeNull();
    expect(
      within(card('turbo')).getByRole('link', {
        name: 'Organization settings',
      }),
    ).toHaveAttribute('href', '/acme/~/settings/organization');
    expect(appState('discovery')).toBe('subscription-required');
    expect(
      within(card('discovery')).getByRole('link', { name: 'View plans' }),
    ).toHaveAttribute('href', '/acme/~/settings/subscription');
  });

  it('reports apps switched off by the platform as unavailable', () => {
    mocks.flags = { studio: true, studio_storyboard: false };
    render(<OrganizationStorePage />);

    expect(appState('storyboard')).toBe('unavailable');
    expect(appState('playground')).toBe('installed');
  });

  it('shows the workflow library only while Automation is installed and eligible', () => {
    mocks.access.isSuperAdmin = true;
    const { rerender } = render(<OrganizationStorePage />);
    expect(screen.queryByTestId('store-workflows')).toBeNull();

    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: { automation: true },
    };
    mocks.installed.installedAppIds = ['playground', 'automation'];
    rerender(<OrganizationStorePage />);
    expect(
      within(screen.getByTestId('store-workflows')).getByRole('link', {
        name: 'Open workflow library',
      }),
    ).toHaveAttribute(
      'href',
      '/acme/moonrise/automation/workflows?view=templates',
    );

    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: false,
      isReleasePreviewEnabled: true,
      moduleOverrides: { automation: true },
    };
    rerender(<OrganizationStorePage />);
    expect(screen.queryByTestId('store-workflows')).toBeNull();
  });

  it('reports a failed read instead of inventing installations', () => {
    mocks.installed.status = 'error';
    mocks.installed.installedAppIds = [];
    render(<OrganizationStorePage />);

    expect(
      screen.getByText(
        "Couldn't load your apps. Reload the page to try again.",
      ),
    ).toBeInTheDocument();
    expect(appState('playground')).toBe('not-installed');
  });
});
