// @vitest-environment jsdom

import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
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

const { default: PluginsPage } = await import('./OrganizationPluginsPage');

/** The page puts a selected plugin's details in the shell's context sidebar. */
function OrganizationPluginsPage() {
  return (
    <ContextSidebarProvider>
      <PluginsPage />
      <ContextSidebarOutlet />
    </ContextSidebarProvider>
  );
}

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

function detail(): HTMLElement {
  return screen.getByTestId('plugins-app-detail');
}

/** Picks a plugin the way a member does: the overlay button on its card. */
async function selectApp(
  user: ReturnType<typeof userEvent.setup>,
  appId: string,
): Promise<void> {
  const label = `${appId.charAt(0).toUpperCase()}${appId.slice(1)}`;
  await user.click(
    within(card(appId)).getByRole('button', { name: `Select ${label}` }),
  );
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

  it('shows the search and the grid without filters or a view toggle', () => {
    render(<OrganizationPluginsPage />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(
      screen.getByTestId('collapsible-search-trigger'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('plugins-thumbnail-playground'),
    ).toBeInTheDocument();
  });

  it('groups installed plugins above the ones left to add, each with its description', () => {
    render(<OrganizationPluginsPage />);

    expect(
      within(screen.getByTestId('plugins-section-installed')).getAllByTestId(
        /^plugins-app-/,
      ),
    ).toHaveLength(1);
    expect(
      within(screen.getByTestId('plugins-section-installed')).getByText(
        'Generate images, video, audio and text from a prompt.',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('plugins-section-available')).getByText(
        'Plan a story scene by scene, then generate it.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('plugins-app-detail')).toBeNull();
  });

  it('opens the selected plugin in the right sidebar and closes it again', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);
    await selectApp(user, 'storyboard');

    expect(detail()).toHaveTextContent(
      'Break an idea into scenes and shots, review the plan',
    );
    expect(detail()).toHaveTextContent('Turn a brief into scenes and shots');
    expect(
      within(card('storyboard')).getByRole('button', {
        name: 'Storyboard, selected',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(card('playground')).getByRole('button', {
        name: 'Select Playground',
      }),
    ).toHaveAttribute('aria-pressed', 'false');

    await selectApp(user, 'playground');
    expect(detail()).toHaveTextContent('Your open canvas');
    expect(within(detail()).queryByText(/Break an idea/)).toBeNull();
  });

  it('narrows the list with the search box', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);

    await user.type(screen.getByPlaceholderText('Search plugins'), 'story');

    expect(
      screen
        .getAllByTestId(/^plugins-app-(?!detail)/)
        .map((element) => element.dataset.testid),
    ).toEqual(['plugins-app-storyboard']);

    await user.clear(screen.getByPlaceholderText('Search plugins'));
    await user.type(screen.getByPlaceholderText('Search plugins'), 'zzzz');

    expect(screen.queryAllByTestId(/^plugins-app-(?!detail)/)).toHaveLength(0);
    expect(screen.getByTestId('plugins-empty')).toHaveTextContent(
      'No plugins match your search.',
    );
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
      within(card('playground')).getByRole('link', {
        name: 'Open Playground',
      }),
    ).toHaveAttribute('href', '/acme/moonrise/playground');
    await selectApp(user, 'storyboard');
    await user.click(
      within(detail()).getByRole('button', {
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
    ).toHaveAttribute('href', '/acme/~/playground');
  });

  it('explains a failed install without showing the app as installed', async () => {
    mocks.install.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);

    await selectApp(user, 'storyboard');
    await user.click(
      within(detail()).getByRole('button', {
        name: 'Add Storyboard',
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't add Storyboard. Try again.",
      ),
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

    await selectApp(user, 'turbo');
    expect(appState('turbo')).toBe('organization-disabled');
    expect(
      within(detail()).getByRole('button', {
        name: 'Add Turbo',
      }),
    ).toBeDisabled();
    expect(
      within(detail()).getByRole('link', {
        name: 'Organization settings',
      }),
    ).toHaveAttribute('href', '/acme/~/settings/modules');
    await selectApp(user, 'discovery');
    expect(appState('discovery')).toBe('subscription-required');
    expect(
      within(detail()).getByRole('link', {
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
    mocks.flags = { ...RELEASED_FLAGS, release_clipper: true };
    render(<OrganizationPluginsPage />);

    expect(card('clipper')).toBeInTheDocument();
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
    await selectApp(user, 'automation');
    expect(
      within(screen.getByTestId('plugins-workflows')).getByRole('link', {
        name: 'Open workflow library',
      }),
    ).toHaveAttribute('href', '/acme/moonrise/automation/workflows/templates');

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

  it('closes details when the search leaves the selection out of the results', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);
    await selectApp(user, 'storyboard');
    expect(detail()).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search plugins'), 'prompt');

    expect(card('playground')).toBeInTheDocument();
    expect(screen.queryByTestId('plugins-app-storyboard')).toBeNull();
    expect(screen.queryByTestId('plugins-app-detail')).toBeNull();
  });

  it('clears an empty search from the empty state', async () => {
    const user = userEvent.setup();
    render(<OrganizationPluginsPage />);

    await user.type(screen.getByPlaceholderText('Search plugins'), 'zzzz');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(screen.queryByTestId('plugins-empty')).toBeNull();
    expect(screen.getAllByTestId(/^plugins-app-(?!detail)/)).toHaveLength(4);
  });

  it('blocks repeat installs and removals while saving', async () => {
    const user = userEvent.setup();
    mocks.installed.pendingAppIds = ['storyboard', 'playground'];
    render(<OrganizationPluginsPage />);
    await user.click(screen.getByRole('button', { name: 'Playground' }));
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');
    await selectApp(user, 'storyboard');
    for (const button of screen.getAllByRole('button', {
      name: 'Add Storyboard',
    })) {
      expect(button).toBeDisabled();
    }
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it('uses the saved pin/remove actions and reports a failed removal', async () => {
    const user = userEvent.setup();
    mocks.uninstall.mockResolvedValue(false);
    render(<OrganizationPluginsPage />);
    await user.click(screen.getByRole('button', { name: 'Playground' }));
    await user.click(screen.getByRole('menuitem', { name: /Pin Playground/ }));
    expect(mocks.togglePin).toHaveBeenCalledWith('playground');
    await user.click(screen.getByRole('button', { name: 'Playground' }));
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
    await selectApp(user, 'storyboard');
    await user.click(
      within(detail()).getByRole('button', { name: 'Add Storyboard' }),
    );
    mocks.orgSlug = 'other';
    rerender(<OrganizationPluginsPage />);
    await act(async () => finishInstall(false));
    expect(screen.queryByTestId('plugins-app-detail')).toBeNull();
    await selectApp(user, 'storyboard');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the approved artwork in the sidebar for every offered app', async () => {
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
      await user.click(within(row).getByRole('button', { name: /^Select / }));
      expect(
        decodeURIComponent(
          within(detail()).getByRole('img').getAttribute('src') ?? '',
        ),
      ).toContain('/plugins/');
    }
  });
});
