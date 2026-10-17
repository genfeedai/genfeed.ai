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
  usePathname: () => '/acme/~/explore',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const { default: OrganizationExplorePage } = await import(
  './OrganizationExplorePage'
);

/** Admin → Flags as the release migration leaves it. */
const RELEASED_FLAGS = {
  release_analytics: true,
  release_discovery: true,
  release_publishing: true,
  release_turbo: true,
};

function card(appId: string): HTMLElement {
  return screen.getByTestId(`explore-app-${appId}`);
}

function appState(appId: string): string | null | undefined {
  return card(appId)
    .querySelector('[data-app-state]')
    ?.getAttribute('data-app-state');
}

describe('OrganizationExplorePage (#5502)', () => {
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
    render(<OrganizationExplorePage />);

    expect(
      screen
        .getAllByTestId(/^explore-app-/)
        .map((element) => element.dataset.testid),
    ).toEqual([
      'explore-app-playground',
      'explore-app-storyboard',
      'explore-app-turbo',
      'explore-app-discovery',
    ]);
  });

  it('shows featured apps, your installed apps and category shelves', () => {
    // Turbo ships switched off, and a turned-off app is not headlined, so the
    // organization turns it on to see all three featured apps.
    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      moduleOverrides: { turbo: true },
    };
    render(<OrganizationExplorePage />);

    expect(
      within(screen.getByTestId('explore-featured'))
        .getAllByTestId(/^explore-featured-/)
        .map((element) => element.dataset.testid),
    ).toEqual([
      'explore-featured-playground',
      'explore-featured-storyboard',
      'explore-featured-turbo',
    ]);
    // Every card, featured or not, leads with its app thumbnail.
    for (const appId of ['playground', 'storyboard', 'turbo']) {
      expect(
        within(screen.getByTestId(`explore-featured-${appId}`)).getByTestId(
          `explore-thumbnail-${appId}`,
        ),
      ).toBeInTheDocument();
    }
    expect(
      within(card('discovery')).getByTestId('explore-thumbnail-discovery'),
    ).toBeInTheDocument();
    // Only the installed, openable app is listed under Your apps; no usage
    // counts exist, so nothing claims to be "most used".
    expect(
      within(screen.getByTestId('explore-yours'))
        .getAllByTestId(/^explore-yours-/)
        .map((element) => element.dataset.testid),
    ).toEqual(['explore-yours-playground']);
    expect(screen.getByTestId('explore-category-create')).toBeInTheDocument();
    expect(screen.getByTestId('explore-category-publish')).toBeInTheDocument();
    expect(screen.queryByTestId('explore-category-automate')).toBeNull();
  });

  it('filters the shelves with the category chips', async () => {
    const user = userEvent.setup();
    render(<OrganizationExplorePage />);

    await user.click(screen.getByRole('button', { name: 'Publish & grow' }));

    expect(screen.queryByTestId('explore-featured')).toBeNull();
    expect(screen.queryByTestId('explore-category-create')).toBeNull();
    expect(
      screen
        .getAllByTestId(/^explore-app-/)
        .map((element) => element.dataset.testid),
    ).toEqual(['explore-app-discovery']);
  });

  it('lists every native app for an organization on release preview', () => {
    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: {},
    };
    render(<OrganizationExplorePage />);

    expect(screen.getAllByTestId(/^explore-app-/)).toHaveLength(9);
  });

  it('opens an installed app and installs one that is not installed', async () => {
    const user = userEvent.setup();
    render(<OrganizationExplorePage />);

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
    render(<OrganizationExplorePage />);

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
      moduleOverrides: { turbo: false },
    };
    render(<OrganizationExplorePage />);

    expect(appState('turbo')).toBe('organization-disabled');
    // A turned-off app is not headlined in Featured; it stays on its shelf.
    expect(screen.queryByTestId('explore-featured-turbo')).toBeNull();
    expect(
      within(card('turbo')).getByRole('button', { name: 'Install Turbo' }),
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
    mocks.flags = { ...RELEASED_FLAGS, studio: true, studio_storyboard: false };
    render(<OrganizationExplorePage />);

    expect(screen.queryByTestId('explore-app-storyboard')).toBeNull();
    expect(appState('playground')).toBe('installed');
  });

  it('lists an app once it is released in Admin → Flags', () => {
    mocks.flags = { ...RELEASED_FLAGS, release_clips: true };
    render(<OrganizationExplorePage />);

    expect(card('clips')).toBeInTheDocument();
    expect(screen.queryByTestId('explore-app-motion')).toBeNull();
  });

  it('shows the workflow library only while Automation is installed and eligible', () => {
    const { rerender } = render(<OrganizationExplorePage />);
    expect(screen.queryByTestId('explore-workflows')).toBeNull();

    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: { automation: true },
    };
    mocks.installed.installedAppIds = ['playground', 'automation'];
    rerender(<OrganizationExplorePage />);
    expect(
      within(screen.getByTestId('explore-workflows')).getByRole('link', {
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
    rerender(<OrganizationExplorePage />);
    expect(screen.queryByTestId('explore-workflows')).toBeNull();
  });

  it('reports a failed read instead of inventing installations', () => {
    mocks.installed.status = 'error';
    mocks.installed.installedAppIds = [];
    render(<OrganizationExplorePage />);

    expect(
      screen.getByText(
        "Couldn't load your apps. Reload the page to try again.",
      ),
    ).toBeInTheDocument();
    expect(appState('playground')).toBe('not-installed');
  });
});
