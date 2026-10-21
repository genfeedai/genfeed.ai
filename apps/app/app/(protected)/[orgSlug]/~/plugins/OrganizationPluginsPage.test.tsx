// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
  usePathname: () => '/acme/~/plugins',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const { default: OrganizationPluginsPage } = await import(
  './OrganizationPluginsPage'
);

/** Admin → Flags as the release migration leaves it. */
const RELEASED_FLAGS = {
  release_analytics: true,
  release_discovery: true,
  release_publishing: true,
  release_turbo: true,
};

function card(appId: string): HTMLElement {
  return screen.getByTestId(`plugins-app-${appId}`);
}

function appState(appId: string): string | null {
  return card(appId).getAttribute('data-app-state');
}

describe('OrganizationPluginsPage (#5502)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brand.selectedBrand = { slug: 'moonrise' };
    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      moduleOverrides: {},
    };
    mocks.brand.settingsLoading = false;
    mocks.flags = RELEASED_FLAGS;
    mocks.installed.installedAppIds = ['playground'];
    mocks.installed.pendingAppIds = [];
    mocks.installed.status = 'ready';
    mocks.install.mockResolvedValue(true);
    mocks.uninstall.mockResolvedValue(true);
  });

  it('lists released apps for customers and omits unreleased ones', () => {
    render(<OrganizationPluginsPage />);

    expect(
      screen
        .getAllByTestId(/^plugins-app-/)
        .map((element) => element.dataset.testid),
    ).toEqual([
      'plugins-app-playground',
      'plugins-app-storyboard',
      'plugins-app-turbo',
      'plugins-app-discovery',
    ]);
  });

  it('lists installed apps first and the rest by category', () => {
    render(<OrganizationPluginsPage />);

    // Only the installed, openable app is listed under Installed; it is not
    // repeated in the catalog below.
    expect(
      within(screen.getByTestId('plugins-installed'))
        .getAllByTestId(/^plugins-app-/)
        .map((element) => element.dataset.testid),
    ).toEqual(['plugins-app-playground']);
    expect(
      within(screen.getByTestId('plugins-apps'))
        .getAllByTestId(/^plugins-app-/)
        .map((element) => element.dataset.testid),
    ).toEqual([
      'plugins-app-storyboard',
      'plugins-app-turbo',
      'plugins-app-discovery',
    ]);
    // Every row leads with its app thumbnail.
    for (const appId of ['playground', 'storyboard', 'discovery']) {
      expect(
        within(card(appId)).getByTestId(`plugins-thumbnail-${appId}`),
      ).toBeInTheDocument();
    }
    expect(screen.getByTestId('plugins-category-create')).toBeInTheDocument();
    expect(screen.getByTestId('plugins-category-publish')).toBeInTheDocument();
    expect(screen.queryByTestId('plugins-category-automate')).toBeNull();
    expect(screen.queryByTestId('plugins-empty')).toBeNull();
  });

  it('narrows the list with the search box', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);

    await user.type(
      screen.getByRole('textbox', { name: 'Search plugins' }),
      'story',
    );

    expect(
      screen
        .getAllByTestId(/^plugins-app-/)
        .map((element) => element.dataset.testid),
    ).toEqual(['plugins-app-storyboard']);

    await user.clear(screen.getByRole('textbox', { name: 'Search plugins' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Search plugins' }),
      'zzzz',
    );

    expect(screen.queryAllByTestId(/^plugins-app-/)).toHaveLength(0);
    expect(screen.getByTestId('plugins-empty')).toHaveTextContent(
      'No plugins match your search.',
    );
  });

  it('filters the catalog by category', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);

    await user.click(screen.getByRole('button', { name: /Filters/ }));
    screen.getByRole('menuitem', { name: /Category/ }).focus();
    await user.keyboard('{ArrowRight}');
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Publish & grow' }),
    );

    expect(screen.queryByTestId('plugins-category-create')).toBeNull();
    expect(
      screen
        .getAllByTestId(/^plugins-app-/)
        .map((element) => element.dataset.testid),
    ).toEqual(['plugins-app-discovery']);
  });

  it('lists every native app for an organization on release preview', () => {
    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: {},
    };
    render(<OrganizationPluginsPage />);

    expect(screen.getAllByTestId(/^plugins-app-/)).toHaveLength(9);
  });

  it('opens an installed app and installs one that is not installed', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);

    expect(
      within(card('playground')).getByRole('link', { name: 'Open Playground' }),
    ).toHaveAttribute('href', '/acme/moonrise/studio/playground');
    await user.click(
      within(card('storyboard')).getByRole('button', {
        name: 'Add Storyboard',
      }),
    );
    expect(mocks.install).toHaveBeenCalledWith('storyboard');
  });

  it('explains a failed install without showing the app as installed', async () => {
    mocks.install.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);

    await user.click(
      within(card('storyboard')).getByRole('button', {
        name: 'Add Storyboard',
      }),
    );
    await waitFor(() =>
      expect(within(card('storyboard')).getByRole('alert')).toHaveTextContent(
        "Couldn't add Storyboard. Try again.",
      ),
    );
    expect(appState('storyboard')).toBe('not-installed');
  });

  it('shows truthful locked states instead of an install', () => {
    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: false,
      moduleOverrides: { turbo: false },
    };
    render(<OrganizationPluginsPage />);

    expect(appState('turbo')).toBe('organization-disabled');
    expect(
      within(card('turbo')).getByRole('button', { name: 'Add Turbo' }),
    ).toBeDisabled();
    expect(
      within(card('turbo')).getByRole('link', {
        name: 'Organization settings',
      }),
    ).toHaveAttribute('href', '/acme/~/settings/modules');
    expect(appState('discovery')).toBe('subscription-required');
    expect(
      within(card('discovery')).getByRole('link', { name: 'View plans' }),
    ).toHaveAttribute('href', '/acme/~/settings/subscription');
  });

  it('does not list apps switched off by the platform', () => {
    mocks.flags = { ...RELEASED_FLAGS, studio: true, storyboard: false };
    render(<OrganizationPluginsPage />);

    expect(screen.queryByTestId('plugins-app-storyboard')).toBeNull();
    expect(appState('playground')).toBe('installed');
  });

  it('lists an app once it is released in Admin → Flags', () => {
    mocks.flags = { ...RELEASED_FLAGS, release_clips: true };
    render(<OrganizationPluginsPage />);

    expect(card('clips')).toBeInTheDocument();
    expect(screen.queryByTestId('plugins-app-motion')).toBeNull();
  });

  it('shows the workflow library only while Automation is installed and eligible', () => {
    const { rerender } = render(<OrganizationPluginsPage />);
    expect(screen.queryByTestId('plugins-workflows')).toBeNull();

    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: { automation: true },
    };
    mocks.installed.installedAppIds = ['playground', 'automation'];
    rerender(<OrganizationPluginsPage />);
    expect(
      within(screen.getByTestId('plugins-workflows')).getByRole('link', {
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
    rerender(<OrganizationPluginsPage />);
    expect(screen.queryByTestId('plugins-workflows')).toBeNull();
  });

  it('reports a failed read instead of inventing installations', () => {
    mocks.installed.status = 'error';
    mocks.installed.installedAppIds = [];
    render(<OrganizationPluginsPage />);

    expect(
      screen.getByText(
        "Couldn't load your plugins. Reload the page to try again.",
      ),
    ).toBeInTheDocument();
    expect(appState('playground')).toBe('not-installed');
  });
});
