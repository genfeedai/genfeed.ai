// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
  orgSlug: 'acme',
  pinnedAppIds: [] as string[],
  togglePin: vi.fn(),
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
  useOrgUrl: () => ({ orgSlug: mocks.orgSlug }),
}));
vi.mock('@/components/shell/installed-apps.provider', () => ({
  useInstalledApps: () => ({
    ...mocks.installed,
    install: mocks.install,
    uninstall: mocks.uninstall,
  }),
}));
vi.mock('@/components/shell/rail-preferences.provider', () => ({
  useRailPreferencesContext: () => ({
    pinnedAppIds: mocks.pinnedAppIds,
    togglePin: mocks.togglePin,
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
  useSearchParams: () => new URLSearchParams(),
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
  return (
    card(appId)
      .querySelector('[data-app-state]')
      ?.getAttribute('data-app-state') ?? null
  );
}

describe('OrganizationPluginsPage (#7842)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orgSlug = 'acme';
    mocks.pinnedAppIds = [];
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
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
        .getAllByTestId(/^plugins-app-(?!detail)/)
        .map((element) => element.dataset.testid),
    ).toEqual([
      'plugins-app-playground',
      'plugins-app-storyboard',
      'plugins-app-turbo',
      'plugins-app-discovery',
    ]);
  });

  it('shows one status tablist with ALL and a category dropdown', () => {
    render(<OrganizationPluginsPage />);
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'ALL' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('combobox', { name: 'Category' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /All apps/i })).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Playground' }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('plugins-thumbnail-playground'),
    ).toBeInTheDocument();
  });

  it('changes the preview when an app is selected', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);
    await user.click(card('storyboard'));
    expect(
      screen.getByRole('heading', { name: 'Storyboard' }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('plugins-thumbnail-storyboard'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('plugins-thumbnail-playground')).toBeNull();
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
        .getAllByTestId(/^plugins-app-(?!detail)/)
        .map((element) => element.dataset.testid),
    ).toEqual(['plugins-app-storyboard']);

    await user.clear(screen.getByRole('textbox', { name: 'Search plugins' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Search plugins' }),
      'zzzz',
    );

    expect(screen.queryAllByTestId(/^plugins-app-(?!detail)/)).toHaveLength(0);
    expect(screen.getByTestId('plugins-empty')).toHaveTextContent(
      'No plugins match your search.',
    );
  });

  it('filters the catalog by category', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(
      await screen.findByRole('option', { name: 'Publish & grow' }),
    );

    expect(
      screen
        .getAllByTestId(/^plugins-app-(?!detail)/)
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

    expect(screen.getAllByTestId(/^plugins-app-(?!detail)/)).toHaveLength(9);
  });

  it('opens an installed app and installs one that is not installed', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);

    expect(
      within(screen.getByTestId('plugins-app-detail')).getByRole('link', {
        name: 'Open Playground',
      }),
    ).toHaveAttribute('href', '/acme/moonrise/studio/playground');
    await user.click(card('storyboard'));
    await user.click(
      within(screen.getByTestId('plugins-app-detail')).getByRole('button', {
        name: 'Add Storyboard',
      }),
    );
    expect(mocks.install).toHaveBeenCalledWith('storyboard');
  });

  it('opens through the organization route when no brand is selected', () => {
    mocks.brand.selectedBrand = undefined;
    render(<OrganizationPluginsPage />);
    expect(
      screen.getByRole('link', { name: 'Open Playground' }),
    ).toHaveAttribute('href', '/acme/~/studio/playground');
  });

  it('explains a failed install without showing the app as installed', async () => {
    mocks.install.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);

    await user.click(card('storyboard'));
    await user.click(
      within(screen.getByTestId('plugins-app-detail')).getByRole('button', {
        name: 'Add Storyboard',
      }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId('plugins-app-detail')).getByRole('alert'),
      ).toHaveTextContent("Couldn't add Storyboard. Try again."),
    );
    expect(appState('storyboard')).toBe('not-installed');
  });

  it('shows truthful locked states instead of an install', async () => {
    const user = userEvent.setup();
    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: false,
      moduleOverrides: { turbo: false },
    };
    render(<OrganizationPluginsPage />);

    await user.click(card('turbo'));
    expect(appState('turbo')).toBe('organization-disabled');
    expect(
      within(screen.getByTestId('plugins-app-detail')).getByRole('button', {
        name: 'Add Turbo',
      }),
    ).toBeDisabled();
    expect(
      within(screen.getByTestId('plugins-app-detail')).getByRole('link', {
        name: 'Organization settings',
      }),
    ).toHaveAttribute('href', '/acme/~/settings/modules');
    await user.click(card('discovery'));
    expect(appState('discovery')).toBe('subscription-required');
    expect(
      within(screen.getByTestId('plugins-app-detail')).getByRole('link', {
        name: 'View plans',
      }),
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

  it('offers the workflow library in the eligible installed Automation preview', async () => {
    const user = userEvent.setup();
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
    expect(screen.queryByTestId('plugins-workflows')).toBeNull();
    await user.click(card('automation'));
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
    expect(screen.queryByTestId('plugins-browser')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull();
  });
  it('filters by installation state and falls back when selection leaves the results', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);
    await user.click(card('storyboard'));
    await user.click(screen.getByRole('tab', { name: 'Installed' }));
    expect(screen.getAllByTestId(/^plugins-app-(?!detail)/)).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Playground' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Available' }));
    expect(screen.queryByTestId('plugins-app-playground')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Storyboard' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Restricted' }));
    expect(appState('turbo')).toBe('organization-disabled');
    expect(screen.queryByTestId('plugins-app-storyboard')).toBeNull();
  });

  it('blocks repeat installs and removals while saving', async () => {
    const user = userEvent.setup();
    mocks.installed.pendingAppIds = ['storyboard', 'playground'];
    render(<OrganizationPluginsPage />);
    await user.click(
      screen.getByRole('button', { name: 'Playground', exact: true }),
    );
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');
    await user.click(card('storyboard'));
    expect(
      screen.getByRole('button', { name: 'Add Storyboard' }),
    ).toBeDisabled();
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it('uses the saved pin/remove actions and reports a failed removal', async () => {
    const user = userEvent.setup();
    mocks.uninstall.mockResolvedValue(false);
    render(<OrganizationPluginsPage />);
    await user.click(
      screen.getByRole('button', { name: 'Playground', exact: true }),
    );
    await user.click(screen.getByRole('menuitem', { name: /Pin Playground/ }));
    expect(mocks.togglePin).toHaveBeenCalledWith('playground');
    await user.click(
      screen.getByRole('button', { name: 'Playground', exact: true }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(mocks.uninstall).toHaveBeenCalledWith('playground');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't remove Playground. Try again.",
    );
    expect(appState('playground')).toBe('installed');
  });

  it('keeps apps out of the chooser while access/installations are loading', () => {
    mocks.installed.status = 'loading';
    render(<OrganizationPluginsPage />);
    expect(
      screen
        .getAllByRole('status', { name: 'Loading app' })
        .find((element) => element.getAttribute('aria-busy') === 'true'),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('plugins-browser')).toBeNull();
  });

  it('resets selection and ignores an old organization action after switching scope', async () => {
    const user = userEvent.setup();
    let finishInstall: (value: boolean) => void = () => {};
    mocks.install.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishInstall = resolve;
        }),
    );
    const { rerender } = render(<OrganizationPluginsPage />);
    await user.click(card('storyboard'));
    await user.click(screen.getByRole('button', { name: 'Add Storyboard' }));
    mocks.orgSlug = 'other';
    rerender(<OrganizationPluginsPage />);
    await act(async () => finishInstall(false));
    expect(
      screen.getByRole('heading', { name: 'Playground' }),
    ).toBeInTheDocument();
    await user.click(card('storyboard'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('provides the approved large preview for every offered app', async () => {
    const user = userEvent.setup();
    mocks.brand.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: {},
    };
    render(<OrganizationPluginsPage />);
    const rows = screen.getAllByTestId(/^plugins-app-(?!detail)/);
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      await user.click(row);
      const detail = screen.getByTestId('plugins-app-detail');
      expect(
        decodeURIComponent(
          within(detail).getByRole('img').getAttribute('src') ?? '',
        ),
      ).toContain('/plugins/');
    }
  });
});
