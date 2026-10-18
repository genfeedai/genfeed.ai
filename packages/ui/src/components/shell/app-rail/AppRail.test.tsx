import {
  ORGANIZATION_MODULE_IDS,
  type OrganizationModulePreferenceInput,
  resolveOrganizationModulePresentationAccess,
} from '@genfeedai/contracts/constants';
import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import type { AppRailProps } from '@genfeedai/props/ui/app-rail.props';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every APP_RAIL_FEATURE_FLAGS key must be listed: the mock falls back to
// `true`, so a missing key silently keeps its item visible and the
// no-modules-released case could never reach Workspace alone.
const featureFlags = vi.hoisted(() => ({
  agent: true,
  analytics: true,
  automation: true,
  library: true,
  messages: true,
  publishing: true,
  discovery: true,
  studio: true,
  studio_turbo: true,
  studio_clips: true,
  studio_editor: true,
  studio_motion: true,
  studio_storyboard: true,
}));

vi.mock('@genfeedai/hooks/feature-flags/provider', () => ({
  useFeatureFlagContext: () => ({
    flags: { ...featureFlags },
    isConfigured: true,
  }),
}));

vi.mock(
  '@genfeedai/hooks/ui/use-is-desktop-client/use-is-desktop-client',
  () => ({
    useIsDesktopClient: () => clientSurface.isDesktop,
  }),
);
const clientSurface = vi.hoisted(() => ({ isDesktop: false }));
const commands = vi.hoisted(() => ({
  registerCommands: vi.fn((items: readonly ICommand[]) =>
    items.map((item) => item.id),
  ),
  unregisterCommands: vi.fn(),
}));
vi.mock('@genfeedai/services/core/command-palette.service', () => ({
  CommandPaletteService: commands,
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: '' }, currentApp: 'app' },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const router = vi.hoisted(() => ({ prefetch: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch,
    ...props
  }: {
    children: ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

// Tooltip content only mounts on hover in Radix; the rail's accessible
// description is the sr-only span, so the tooltip renders as a passthrough.
vi.mock('@ui/primitives/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="rail-tooltip">{children}</div>
  ),
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/primitives/separator', () => ({
  Separator: ({ className, ...props }: { className?: string }) => (
    <div className={className} {...props} />
  ),
}));

// Keep shared constants available to primitives while controlling rail routes.
vi.mock('@genfeedai/contracts/constants', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/contracts/constants')>();
  const normalize = (routePath: string) =>
    routePath.length === 0 || routePath === '/'
      ? ''
      : routePath.startsWith('/')
        ? routePath
        : `/${routePath}`;
  return {
    ...actual,
    APP_DISPLAY_LABELS: {
      admin: 'Admin',
      agent: 'Agent',
      analytics: 'Analytics',
      automation: 'Automation',
      discovery: 'Discovery',
      library: 'Library',
      messages: 'Messages',
      publishing: 'Publishing',
      workspace: 'Workspace',
    },
    APP_ROUTES: {
      STUDIO: actual.APP_ROUTES.STUDIO,
      ADMIN: actual.APP_ROUTES.ADMIN,
    },
    APP_RAIL_FEATURE_FLAGS: {
      agent: 'agent',
      messages: 'messages',
      automation: 'automation',
      discovery: 'discovery',
      studio: 'studio',
      library: 'library',
      publishing: 'publishing',
      analytics: 'analytics',
    },
    createBrandAppRoute: (
      orgSlug: string,
      brandSlug: string,
      routePath = '/',
    ) => `/${orgSlug}/${brandSlug}${normalize(routePath)}`,
    createOrganizationAppRoute: (orgSlug: string, routePath = '/') =>
      `/${orgSlug}/~${normalize(routePath)}`,
  };
});

vi.mock('@genfeedai/helpers/formatting/cn/cn.util', () => ({
  cn: (...classes: (string | false | undefined | null)[]) =>
    classes.filter(Boolean).join(' '),
}));

// Import after mocks are set up
const { AppRail: RailUnderTest } = await import('./AppRail');

function AppRail(props: AppRailProps) {
  return <RailUnderTest {...props} />;
}

/** Admin → Flags as the release migration leaves it. */
const RELEASED_FLAGS = {
  release_analytics: true,
  release_discovery: true,
  release_publishing: true,
  release_turbo: true,
};

function moduleAccessFor(settings: OrganizationModulePreferenceInput) {
  return Object.fromEntries(
    ORGANIZATION_MODULE_IDS.map((moduleId) => [
      moduleId,
      resolveOrganizationModulePresentationAccess(
        settings,
        moduleId,
        RELEASED_FLAGS,
      ),
    ]),
  );
}

// Launcher apps are reached from the Store, so the rail only renders the ones
// a member has pinned. Pinning every id exercises each app's visibility rules.
const LAUNCHER_APP_IDS = [
  'playground',
  'storyboard',
  'turbo',
  'motion',
  'clips',
  'editor',
  'automation',
  'messages',
  'discovery',
];

const CORE_APP_IDS = [
  'workspace',
  'agent',
  'library',
  'publishing',
  'analytics',
];

// The launcher apps that rendered as rail items, in rail order.
function renderedLauncherAppIds() {
  return screen
    .queryAllByTestId(/^app-rail-item-/)
    .map((item) => item.dataset.testid?.replace('app-rail-item-', '') ?? '')
    .filter((appId) => LAUNCHER_APP_IDS.includes(appId));
}

describe('AppRail', () => {
  it('does not link rail items while onboarding holds navigation', () => {
    render(<AppRail isNavigationSuspended orgSlug="acme" />);
    const agent = screen.getByTestId('app-rail-item-agent');
    expect(agent.tagName).toBe('BUTTON');
    expect(agent).toBeDisabled();
    expect(screen.getByTestId('app-rail')).toHaveAttribute(
      'data-onboarding-hold',
      'true',
    );
    expect(commands.registerCommands).not.toHaveBeenCalled();
  });

  it('keeps the web G-then-N shortcut in the palette, not the tooltip', () => {
    render(<AppRail orgSlug="acme" />);
    expect(
      screen.getAllByTestId('rail-tooltip')[0].querySelector('kbd'),
    ).toBeNull();
    expect(commands.registerCommands.mock.lastCall?.[0][0].shortcut).toEqual([
      'G',
      '1',
    ]);
  });

  it('registers visible apps in rail order and routes palette actions through the same resolver', () => {
    const onNavigationEvent = vi.fn();
    const { unmount } = render(
      <AppRail
        orgSlug="acme"
        brandAwareSlug="selected"
        currentPath="/acme/~/analytics"
        onNavigationEvent={onNavigationEvent}
        preservedSearch="taskId=t1"
        resolveNavigation={(href) => ({ href: `${href}&thread=one` })}
      />,
    );
    const registered = commands.registerCommands.mock.lastCall?.[0] ?? [];
    expect(registered.map((entry) => entry.label)).toEqual([
      'Go to Workspace',
      'Go to Agent',
      'Go to Library',
      'Go to Publishing',
      'Go to Analytics',
      'Go to Playground',
      'Go to Storyboard',
      'Go to Turbo',
      'Go to Motion',
      'Go to Clips',
      'Go to Editor',
      'Go to Automation',
      'Go to Messages',
      'Go to Discovery',
    ]);
    expect(registered[2].shortcut).toEqual(['G', '3']);
    expect(registered[5].shortcut).toBeUndefined();
    act(() => {
      registered[2].action();
    });
    expect(router.push).toHaveBeenCalledWith(
      '/acme/~/library/assets?taskId=t1&thread=one',
    );
    expect(onNavigationEvent).toHaveBeenCalledWith({
      from_app: 'analytics',
      to_app: 'library',
      via: 'palette',
      surface: 'desktop',
    });
    unmount();
    expect(commands.unregisterCommands).toHaveBeenCalledWith(
      registered.map((entry) => entry.id),
    );
  });

  it('captures clicks once and lets the Link own navigation', () => {
    const onNavigationEvent = vi.fn();
    render(
      <AppRail
        orgSlug="acme"
        currentPath="/settings/personal"
        onNavigationEvent={onNavigationEvent}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Publishing' }));
    expect(onNavigationEvent).toHaveBeenCalledExactlyOnceWith({
      from_app: null,
      to_app: 'publishing',
      via: 'click',
      surface: 'desktop',
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('lists admin categories instead of the app loop in admin chrome', () => {
    render(
      <AppRail
        currentPath="/admin/content/posts"
        isAdminChrome
        orgSlug="acme"
        showAdmin
      />,
    );
    expect(screen.getByTestId('app-rail-item-admin-back')).toBeInTheDocument();
    expect(screen.queryByTestId('app-rail-item-workspace')).toBeNull();
    for (const id of [
      'admin-overview',
      'admin-content',
      'admin-automation',
      'admin-configuration',
      'admin-administration',
    ]) {
      expect(screen.getByTestId(`app-rail-item-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('app-rail-item-admin-content')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByTestId('app-rail-item-admin-content')).toHaveAttribute(
      'href',
      '/admin/content/posts',
    );
    expect(screen.queryByTestId('app-rail-item-agent')).toBeNull();
    expect(screen.queryByTestId('app-rail-item-admin')).toBeNull();
  });

  it('leads admin chrome with a back button to the workspace, never active', () => {
    render(
      <AppRail
        brandSlug="moonrise"
        currentPath="/admin/content/posts"
        isAdminChrome
        orgSlug="acme"
        showAdmin
      />,
    );
    const back = screen.getByRole('link', { name: 'Back to app' });
    expect(back).toBe(screen.getByTestId('app-rail-item-admin-back'));
    expect(back).toHaveAttribute('href', '/acme/moonrise/workspace/overview');
    expect(back).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('link', { name: 'Workspace' })).toBeNull();
  });

  it('separates the admin back button from the categories with one divider', () => {
    render(
      <AppRail
        currentPath="/admin/content/posts"
        isAdminChrome
        orgSlug="acme"
        showAdmin
      />,
    );
    const nav = screen.getByTestId('app-rail');
    const categories = screen.getByTestId('app-rail-admin-categories');
    // The divider is the group's first child, followed by the five categories.
    expect(categories.querySelectorAll('a')).toHaveLength(5);
    expect(categories.firstElementChild?.tagName).toBe('DIV');
    expect(categories.firstElementChild).toHaveClass('my-1', 'w-5');
    // No empty app-loop group between the back button and the categories.
    expect(
      Array.from(nav.children).filter((child) => child.childElementCount === 0),
    ).toHaveLength(0);
  });

  it('uses web sequences and desktop command keys without numbering Admin', () => {
    const onNavigationEvent = vi.fn();
    const { rerender } = render(
      <AppRail
        orgSlug="acme"
        showAdmin
        onNavigationEvent={onNavigationEvent}
      />,
    );
    fireEvent.keyDown(document, { code: 'KeyG', key: 'g' });
    fireEvent.keyDown(document, { code: 'Digit9', key: '9' });
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { code: 'KeyG', key: 'g' });
    fireEvent.keyDown(document, { code: 'Digit5', key: '5' });
    expect(router.push).toHaveBeenLastCalledWith('/acme/~/analytics/overview');
    expect(onNavigationEvent).toHaveBeenLastCalledWith({
      from_app: null,
      to_app: 'analytics',
      via: 'shortcut',
      surface: 'desktop',
    });
    expect(commands.registerCommands.mock.lastCall?.[0]).toHaveLength(15);
    expect(commands.registerCommands.mock.lastCall?.[0][14]).toMatchObject({
      label: 'Go to Admin',
      shortcut: undefined,
    });
    clientSurface.isDesktop = true;
    rerender(<AppRail orgSlug="acme" showAdmin />);
    fireEvent.keyDown(document, { code: 'Digit1', key: '1', metaKey: true });
    expect(router.push).toHaveBeenLastCalledWith('/acme/~/workspace/overview');
    const tooltips = screen.getAllByTestId('rail-tooltip');
    expect(tooltips[0]).toHaveTextContent('⌘ 1');
    expect(tooltips.at(-1)?.querySelector('kbd')).toBeNull();
  });

  it('has one keyboard and palette owner when desktop and drawer are both mounted', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    const onNavigate = vi.fn();
    const onNavigationEvent = vi.fn();
    render(
      <>
        <AppRail orgSlug="acme" />
        <AppRail
          orgSlug="acme"
          surface="drawer"
          onNavigate={onNavigate}
          onNavigationEvent={onNavigationEvent}
        />
      </>,
    );
    expect(commands.registerCommands).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { code: 'KeyG', key: 'g' });
    fireEvent.keyDown(document, { code: 'Digit2', key: '2' });
    expect(router.push).toHaveBeenCalledExactlyOnceWith('/acme/~/agent');
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigationEvent).toHaveBeenCalledExactlyOnceWith({
      from_app: null,
      to_app: 'agent',
      via: 'shortcut',
      surface: 'drawer',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    router.prefetch.mockClear();
    router.push.mockClear();
    commands.registerCommands.mockClear();
    commands.unregisterCommands.mockClear();
    clientSurface.isDesktop = false;
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    for (const key of Object.keys(featureFlags) as Array<
      keyof typeof featureFlags
    >) {
      featureFlags[key] = true;
    }
  });

  it('warms only the intended resolved item after a sustained interaction', () => {
    vi.useFakeTimers();
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        resolveNavigation={(href) => ({ href: `${href}?thread=123` })}
      />,
    );
    expect(router.prefetch).not.toHaveBeenCalled();
    const workspace = screen.getByRole('link', { name: 'Workspace' });
    const analytics = screen.getByRole('link', { name: 'Analytics' });
    fireEvent.mouseEnter(workspace);
    fireEvent.mouseLeave(workspace);
    fireEvent.focus(analytics);
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(router.prefetch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(router.prefetch).toHaveBeenCalledTimes(1);
    expect(router.prefetch).toHaveBeenCalledWith(
      '/acme/my-brand/analytics/overview?thread=123',
      { kind: 'auto', onInvalidate: expect.any(Function) },
    );
  });

  it('never viewport-prefetches the rail destinations', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        pinnedAppIds={LAUNCHER_APP_IDS}
        showAdmin
      />,
    );
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('data-prefetch', 'false');
    }
  });
  it('renders only the core loop when nothing is pinned (#5502)', () => {
    render(<AppRail orgSlug="acme" />);

    expect(
      screen.getByRole('navigation', { name: 'Apps' }),
    ).toBeInTheDocument();

    const labels = ['Workspace', 'Agent', 'Library', 'Publishing', 'Analytics'];
    expect(
      screen
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(labels);
    expect(
      screen
        .getByRole('link', { name: 'Publishing' })
        .querySelector('svg')
        ?.classList.toString(),
    ).toMatch(/lucide-calendar/);
    // Explore lives in the topbar, so the rail ends with the core loop.
    // Launcher apps live in the Store until they are pinned.
    expect(renderedLauncherAppIds()).toEqual([]);
    for (const retired of [
      'Studio',
      'Batch',
      'More',
      'Admin',
      'Store',
      'Apps',
    ]) {
      expect(
        screen.queryByRole('link', { name: retired }),
      ).not.toBeInTheDocument();
    }
  });

  it('keeps pinned apps after the core loop', () => {
    render(<AppRail orgSlug="acme" pinnedAppIds={['playground']} />);

    expect(
      screen
        .getAllByTestId(/^app-rail-item-/)
        .map((item) => item.dataset.testid),
    ).toEqual([
      'app-rail-item-workspace',
      'app-rail-item-agent',
      'app-rail-item-library',
      'app-rail-item-publishing',
      'app-rail-item-analytics',
      'app-rail-item-playground',
    ]);
  });
  it('pins only installed, available apps (#5502)', () => {
    render(
      <AppRail
        orgSlug="acme"
        installedAppIds={['playground', 'clips', 'discovery', 'automation']}
        moduleAccess={{
          automation: { isAllowed: false, reason: 'unreleased' },
          clips: { isAllowed: false, reason: 'unreleased' },
          discovery: { isAllowed: false, reason: 'subscription-required' },
          playground: { isAllowed: true, reason: null },
        }}
        pinnedAppIds={['clips', 'discovery', 'storyboard', 'playground']}
      />,
    );
    // Clips and Automation are unreleased, Discovery needs a plan and
    // Storyboard is not installed: only Playground can be pinned or launched.
    expect(
      screen
        .getAllByTestId(/^app-rail-item-/)
        .map((item) => item.dataset.testid),
    ).toEqual([
      'app-rail-item-workspace',
      'app-rail-item-agent',
      'app-rail-item-library',
      'app-rail-item-publishing',
      'app-rail-item-analytics',
      'app-rail-item-playground',
    ]);
  });

  it('hides launcher apps while organization access is unresolved', () => {
    render(
      <AppRail
        orgSlug="acme"
        moduleAccess={null}
        pinnedAppIds={LAUNCHER_APP_IDS}
      />,
    );
    expect(renderedLauncherAppIds()).toEqual([]);
  });
  it('keeps grayscale focus indicators and fills only the active item', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/workspace"
      />,
    );

    const workspace = screen.getByRole('link', { name: 'Workspace' });
    const analytics = screen.getByRole('link', { name: 'Analytics' });

    expect(workspace).toHaveAccessibleDescription('Command center.');
    expect(workspace).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-ring/60',
      'focus-visible:ring-offset-gray-100',
      'rounded-lg',
      'bg-foreground/[0.12]',
      'text-foreground',
    );
    expect(analytics).not.toHaveClass('bg-foreground/[0.12]');
    expect(analytics).toHaveClass(
      'text-foreground/50',
      'hover:bg-foreground/[0.06]',
      'hover:text-foreground',
    );
  });

  it('pins the header slot above the apps', () => {
    render(
      <AppRail orgSlug="acme" header={<div data-testid="org-avatar">A</div>} />,
    );

    const header = screen.getByTestId('app-rail-header');
    expect(header).toContainElement(screen.getByTestId('org-avatar'));
    expect(
      header.compareDocumentPosition(
        screen.getByRole('link', { name: 'Agent' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('pins the footer at the very bottom, below Admin', () => {
    render(
      <AppRail
        orgSlug="acme"
        showAdmin
        footer={<div data-testid="rail-footer">Help and account</div>}
      />,
    );

    const bottom = screen.getByTestId('app-rail-bottom');
    expect(bottom).toContainElement(
      screen.getByRole('link', { name: 'Admin' }),
    );
    expect(bottom).toContainElement(screen.getByTestId('rail-footer'));
    expect(
      screen
        .getByRole('link', { name: 'Admin' })
        .compareDocumentPosition(screen.getByTestId('rail-footer')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the footer when there is no Admin', () => {
    render(
      <AppRail
        orgSlug="acme"
        footer={<div data-testid="rail-footer">Help and account</div>}
      />,
    );

    expect(screen.getByTestId('rail-footer')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Admin' }),
    ).not.toBeInTheDocument();
  });

  it('pins Admin below the product apps', () => {
    render(<AppRail orgSlug="acme" showAdmin />);

    const labels = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'));

    expect(labels.at(-1)).toBe('Admin');
    expect(labels.at(-2)).toBe('Analytics');
  });

  it('locks gated apps behind the first asset but keeps their own route for the teaser', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        isAssetGateLocked
        pinnedAppIds={['playground']}
      />,
    );

    const hrefs = {
      analytics: '/acme/my-brand/analytics/overview',
      library: '/acme/my-brand/library/assets',
      workspace: '/acme/my-brand/workspace/overview',
    } as const;
    for (const [label, id] of [
      ['Workspace', 'workspace'],
      ['Library', 'library'],
      ['Analytics', 'analytics'],
    ] as const) {
      const link = screen.getByRole('link', {
        name: `${label} — locked. Generate your first asset to unlock.`,
      });
      expect(link).toHaveAttribute('href', hrefs[id]);
      expect(link).toHaveClass('opacity-60');
    }
    expect(screen.getByRole('link', { name: 'Playground' })).toHaveAttribute(
      'href',
      '/acme/my-brand/studio/playground',
    );
  });

  it('shows the lock instead of a badge on a locked item', () => {
    render(
      <AppRail
        orgSlug="acme"
        isAssetGateLocked
        badges={{ workspace: { count: 4, label: '4 new' } }}
      />,
    );

    expect(
      screen.queryByTestId('app-rail-badge-workspace'),
    ).not.toBeInTheDocument();
  });

  it('reports navigation so a drawer host can close', () => {
    const onNavigate = vi.fn();
    render(
      <AppRail
        orgSlug="acme"
        onNavigate={onNavigate}
        pinnedAppIds={['playground']}
      />,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Playground' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('link', { name: 'Analytics' }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });
  it('renders Library with the library icon', () => {
    render(<AppRail orgSlug="acme" />);

    const libraryLink = screen.getByRole('link', { name: 'Library' });
    const icon = libraryLink.querySelector('svg');

    expect(icon).not.toBeNull();
    expect(icon?.classList.toString()).toMatch(/lucide-library-big/);
    expect(icon?.classList.toString()).not.toMatch(/lucide-briefcase/);
  });

  it('uses cloud module access for pinned apps and the palette', () => {
    render(
      <AppRail
        orgSlug="acme"
        pinnedAppIds={LAUNCHER_APP_IDS}
        moduleAccess={moduleAccessFor({
          hasOrganizationBilling: true,
          hasPaidModuleSubscription: true,
          isReleasePreviewEnabled: true,
          moduleOverrides: {},
        })}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Playground' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Discovery' })).toBeInTheDocument();
    for (const label of ['Automation', 'Messages', 'Clips', 'Turbo']) {
      expect(
        screen.queryByRole('link', { name: label }),
      ).not.toBeInTheDocument();
    }
    expect(
      commands.registerCommands.mock.lastCall?.[0].map((entry) => entry.label),
    ).toEqual([
      'Go to Workspace',
      'Go to Agent',
      'Go to Library',
      'Go to Publishing',
      'Go to Analytics',
      'Go to Playground',
      'Go to Storyboard',
      'Go to Discovery',
    ]);
  });

  it('hides disabled saved pins and palette commands, then restores the same pins when enabled', () => {
    const { rerender } = render(
      <AppRail
        orgSlug="acme"
        pinnedAppIds={['automation']}
        moduleAccess={moduleAccessFor({
          hasOrganizationBilling: true,
          hasPaidModuleSubscription: true,
          moduleOverrides: {},
        })}
      />,
    );
    expect(
      screen.queryByTestId('app-rail-item-automation'),
    ).not.toBeInTheDocument();
    expect(
      commands.registerCommands.mock.lastCall?.[0].some(
        (entry) => entry.label === 'Go to Automation',
      ),
    ).toBe(false);
    rerender(
      <AppRail
        orgSlug="acme"
        pinnedAppIds={['automation']}
        moduleAccess={moduleAccessFor({
          hasOrganizationBilling: true,
          hasPaidModuleSubscription: true,
          isReleasePreviewEnabled: true,
          moduleOverrides: { automation: true },
        })}
      />,
    );
    expect(screen.getByTestId('app-rail-item-automation')).toBeInTheDocument();
    expect(
      commands.registerCommands.mock.lastCall?.[0].some(
        (entry) => entry.label === 'Go to Automation',
      ),
    ).toBe(true);
  });

  it('hides subscription apps until the organization has a paid plan', () => {
    render(
      <AppRail
        orgSlug="acme"
        pinnedAppIds={LAUNCHER_APP_IDS}
        moduleAccess={moduleAccessFor({
          hasOrganizationBilling: true,
          hasPaidModuleSubscription: false,
          moduleOverrides: {},
        })}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Playground' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Discovery' }),
    ).not.toBeInTheDocument();
  });

  it('keeps unreleased apps out of a customer rail the organization shows', () => {
    render(
      <AppRail
        orgSlug="acme"
        pinnedAppIds={LAUNCHER_APP_IDS}
        moduleAccess={moduleAccessFor({
          hasOrganizationBilling: true,
          hasPaidModuleSubscription: true,
          moduleOverrides: {
            automation: true,
            clips: true,
            editor: true,
            messages: true,
            motion: true,
            turbo: true,
          },
        })}
      />,
    );
    expect(
      screen
        .getAllByTestId(/^app-rail-item-/)
        .map((item) => item.dataset.testid),
    ).toEqual([
      ...CORE_APP_IDS.map((appId) => `app-rail-item-${appId}`),
      'app-rail-item-playground',
      'app-rail-item-storyboard',
      'app-rail-item-turbo',
      'app-rail-item-discovery',
    ]);
  });
  it('keeps fixed and neutral navigation while verified preferences are unavailable', () => {
    render(
      <AppRail
        orgSlug="acme"
        moduleAccess={null}
        modulePreferences={null}
        pinnedAppIds={LAUNCHER_APP_IDS}
      />,
    );
    expect(screen.getByRole('link', { name: 'Workspace' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Publishing' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Analytics' }),
    ).not.toBeInTheDocument();
    expect(renderedLauncherAppIds()).toEqual([]);
  });

  it('retains operator kill switches when organization access allows a module', () => {
    featureFlags.discovery = false;
    render(
      <AppRail
        orgSlug="acme"
        pinnedAppIds={LAUNCHER_APP_IDS}
        moduleAccess={moduleAccessFor({
          hasOrganizationBilling: false,
          moduleOverrides: {},
        })}
      />,
    );
    expect(
      screen.queryByRole('link', { name: 'Discovery' }),
    ).not.toBeInTheDocument();
    expect(
      commands.registerCommands.mock.lastCall?.[0].some(
        (entry) => entry.label === 'Go to Discovery',
      ),
    ).toBe(false);
  });

  it('shows no pins divider when no pinned app is available', () => {
    featureFlags.studio = false;
    featureFlags.automation = false;
    featureFlags.messages = false;
    featureFlags.discovery = false;

    render(<AppRail orgSlug="acme" pinnedAppIds={LAUNCHER_APP_IDS} />);

    expect(
      screen.queryByTestId('app-rail-pins-separator'),
    ).not.toBeInTheDocument();
    expect(renderedLauncherAppIds()).toEqual([]);
    expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
  });
  it('hides every Studio app when the studio module is switched off', () => {
    featureFlags.studio = false;

    render(<AppRail orgSlug="acme" pinnedAppIds={LAUNCHER_APP_IDS} />);

    for (const label of [
      'Playground',
      'Storyboard',
      'Turbo',
      'Motion',
      'Clips',
      'Editor',
    ]) {
      expect(
        screen.queryByRole('link', { name: label }),
      ).not.toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Messages' })).toBeInTheDocument();
  });

  it('hides one Studio app when its surface switch is off', () => {
    featureFlags.studio_clips = false;

    render(<AppRail orgSlug="acme" pinnedAppIds={LAUNCHER_APP_IDS} />);

    expect(
      screen.queryByRole('link', { name: 'Clips' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editor' })).toBeInTheDocument();
  });

  it('independently hides every module whose discovery flag is disabled', () => {
    featureFlags.messages = false;
    featureFlags.automation = false;
    featureFlags.discovery = false;
    featureFlags.library = false;
    featureFlags.analytics = false;

    render(<AppRail orgSlug="acme" pinnedAppIds={LAUNCHER_APP_IDS} />);

    for (const label of [
      'Messages',
      'Automation',
      'Discovery',
      'Library',
      'Analytics',
    ]) {
      expect(
        screen.queryByRole('link', { name: label }),
      ).not.toBeInTheDocument();
    }
    for (const label of ['Workspace', 'Agent', 'Playground', 'Publishing']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('keeps only Workspace when every module is switched off', () => {
    for (const key of Object.keys(featureFlags) as Array<
      keyof typeof featureFlags
    >) {
      featureFlags[key] = false;
    }

    render(<AppRail orgSlug="acme" />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Workspace' })).toBeInTheDocument();
  });

  it('renders the admin app only when enabled', () => {
    render(<AppRail orgSlug="acme" showAdmin />);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/admin/overview/dashboard',
    );
  });

  it('marks the active app with aria-current="page" from the product path root', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/publishing/review"
      />,
    );
    const activeButton = screen.getByRole('link', { name: 'Publishing' });

    expect(activeButton).toHaveAttribute('aria-current', 'page');
  });

  it('uses the application-owned navigation resolver and announces the mode change', () => {
    render(
      <AppRail
        orgSlug="acme"
        resolveNavigation={(href) => ({
          announcement: 'Opening workspace in canvas mode.',
          href: `${href}?thread=thread-1`,
        })}
      />,
    );

    const workspaceLink = screen.getByRole('link', { name: 'Workspace' });
    expect(workspaceLink).toHaveAttribute(
      'href',
      '/acme/~/workspace/overview?thread=thread-1',
    );

    fireEvent.click(workspaceLink);

    expect(
      screen.getByText('Opening workspace in canvas mode.'),
    ).toBeInTheDocument();
  });

  it('marks the operator agent item active on the agent surface', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/agent/thread-1"
      />,
    );

    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('routes the agent item to the selected brand when the current route is org-scoped', () => {
    render(<AppRail orgSlug="acme" brandAwareSlug="moonrise" />);

    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute(
      'href',
      '/acme/moonrise/agent',
    );
    expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
      'href',
      '/acme/~/workspace/overview',
    );
  });

  it('routes the studio item to the selected brand when the current route is org-scoped (#4671)', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandAwareSlug="moonrise"
        pinnedAppIds={['playground']}
      />,
    );

    expect(screen.getByRole('link', { name: 'Playground' })).toHaveAttribute(
      'href',
      '/acme/moonrise/studio/playground',
    );
  });

  it('keeps the org studio fallback for an operator with no selected brand (#4671)', () => {
    render(<AppRail orgSlug="acme" pinnedAppIds={['playground']} />);

    expect(screen.getByRole('link', { name: 'Playground' })).toHaveAttribute(
      'href',
      '/acme/~/studio/playground',
    );
  });

  it('marks messages active when the messages shell is current', () => {
    const props = {
      orgSlug: 'acme',
      brandSlug: 'my-brand',
      currentPath: '/acme/my-brand/messages',
    };
    const { container, rerender } = render(<AppRail {...props} />);
    // Unpinned, Messages has no rail item to mark.
    expect(container.querySelector('[aria-current="page"]')).toBeNull();

    rerender(<AppRail {...props} pinnedAppIds={['messages']} />);
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
  it('renders Workspace counts with accessible labels and hides zeros', () => {
    const { rerender } = render(
      <AppRail
        orgSlug="acme"
        badges={{
          workspace: {
            count: 120,
            label: '120 unread tasks needing attention',
          },
        }}
      />,
    );
    expect(
      screen.getByRole('link', {
        name: 'Workspace, 120 unread tasks needing attention',
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('app-rail-badge-workspace')).toHaveTextContent(
      '99+',
    );
    rerender(
      <AppRail
        orgSlug="acme"
        badges={{
          workspace: { count: 0, label: '0 unread tasks needing attention' },
        }}
      />,
    );
    expect(
      screen.queryByTestId('app-rail-badge-workspace'),
    ).not.toBeInTheDocument();
  });

  it('keeps registrations stable across route changes while actions use current hrefs', () => {
    const onNavigationEvent = vi.fn();
    const { rerender, unmount } = render(
      <AppRail
        orgSlug="acme"
        brandSlug="brand-one"
        currentPath="/acme/brand-one/agent"
        onNavigationEvent={onNavigationEvent}
      />,
    );
    const initial = commands.registerCommands.mock.lastCall?.[0] ?? [];
    const unregisterCount = commands.unregisterCommands.mock.calls.length;
    rerender(
      <AppRail
        orgSlug="acme"
        brandSlug="brand-two"
        currentPath="/acme/brand-two/workspace/overview"
        onNavigationEvent={onNavigationEvent}
      />,
    );
    expect(commands.registerCommands).toHaveBeenCalledTimes(1);
    expect(commands.unregisterCommands).toHaveBeenCalledTimes(unregisterCount);
    act(() => {
      initial[0].action();
    });
    expect(router.push).toHaveBeenLastCalledWith(
      '/acme/brand-two/workspace/overview',
    );
    expect(onNavigationEvent).toHaveBeenLastCalledWith({
      from_app: 'workspace',
      to_app: 'workspace',
      via: 'palette',
      surface: 'desktop',
    });
    router.push.mockClear();
    fireEvent.keyDown(document, { code: 'KeyG', key: 'g' });
    fireEvent.keyDown(document, { code: 'Digit1', key: '&' });
    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      '/acme/brand-two/workspace/overview',
    );
    expect(onNavigationEvent).toHaveBeenLastCalledWith({
      from_app: 'workspace',
      to_app: 'workspace',
      via: 'shortcut',
      surface: 'desktop',
    });
    unmount();
    expect(commands.unregisterCommands).toHaveBeenLastCalledWith(
      initial.map((command) => command.id),
    );
    router.push.mockClear();
    fireEvent.keyDown(document, { code: 'KeyG', key: 'g' });
    fireEvent.keyDown(document, { code: 'Digit1', key: '1' });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('uses the unnumbered Admin registry command with palette analytics', () => {
    const onNavigationEvent = vi.fn();
    render(
      <AppRail
        orgSlug="acme"
        showAdmin
        onNavigationEvent={onNavigationEvent}
      />,
    );
    const admin = commands.registerCommands.mock.lastCall?.[0].find(
      (command) => command.label === 'Go to Admin',
    );
    expect(admin?.shortcut).toBeUndefined();
    act(() => {
      admin?.action();
    });
    expect(router.push).toHaveBeenLastCalledWith('/admin/overview/dashboard');
    expect(onNavigationEvent).toHaveBeenLastCalledWith({
      from_app: null,
      to_app: 'admin',
      via: 'palette',
      surface: 'desktop',
    });
  });

  it('badges the Messages item with its unread count when pinned', () => {
    const props = {
      badges: { messages: { count: 120, label: '120 unread conversations' } },
      brandSlug: 'my-brand',
      orgSlug: 'acme',
    };
    const { rerender } = render(<AppRail {...props} />);
    // Unpinned, Messages is not on the rail, so its count has no surface here.
    expect(
      screen.queryByTestId('app-rail-badge-messages'),
    ).not.toBeInTheDocument();

    rerender(<AppRail {...props} pinnedAppIds={['messages']} />);

    expect(screen.getByTestId('app-rail-badge-messages')).toHaveTextContent(
      '99+',
    );
    expect(
      screen.getByRole('link', { name: 'Messages, 120 unread conversations' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('app-rail-badge-studio'),
    ).not.toBeInTheDocument();
  });

  it('keeps a pinned app badge on its own item and core badges on theirs', () => {
    featureFlags.discovery = false;
    render(
      <AppRail
        orgSlug="acme"
        pinnedAppIds={['automation']}
        badges={{
          automation: { count: 40, label: '40 runs' },
          messages: { count: 3, label: '3 unread conversations' },
          workspace: { count: 9, label: '9 unread tasks' },
        }}
      />,
    );

    expect(screen.getByTestId('app-rail-badge-automation')).toHaveTextContent(
      '40',
    );
    expect(screen.getByTestId('app-rail-badge-workspace')).toHaveTextContent(
      '9',
    );
    expect(
      screen.queryByTestId('app-rail-badge-messages'),
    ).not.toBeInTheDocument();
  });
  it('hides the Messages badge at zero', () => {
    const props = {
      badges: { messages: { count: 0, label: '0 unread conversations' } },
      brandSlug: 'my-brand',
      orgSlug: 'acme',
    };
    const { rerender } = render(<AppRail {...props} />);

    rerender(<AppRail {...props} pinnedAppIds={['messages']} />);

    expect(
      screen.queryByTestId('app-rail-badge-messages'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Messages' })).toBeInTheDocument();
  });
  it('does not highlight a product app on settings routes', () => {
    render(
      <AppRail
        orgSlug="acme"
        currentPath="/acme/~/settings/brands"
        pinnedAppIds={LAUNCHER_APP_IDS}
      />,
    );

    for (const name of [
      'Workspace',
      'Agent',
      'Playground',
      'Clips',
      'Library',
      'Discovery',
      'Publishing',
      'Analytics',
      'Automation',
      'Messages',
    ]) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });

  it('marks the Studio app that owns a nested path active (#5502)', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/clips/project-1"
        pinnedAppIds={LAUNCHER_APP_IDS}
      />,
    );

    expect(screen.getByRole('link', { name: 'Clips' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Playground' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('marks admin active on admin routes', () => {
    render(
      <AppRail
        orgSlug="acme"
        currentPath="/admin/automation/models"
        showAdmin
      />,
    );

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not set aria-current on inactive app buttons', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/workspace"
      />,
    );

    expect(screen.getByRole('link', { name: 'Analytics' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps the contextual remix route inside Publishing', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/publishing/remix"
      />,
    );

    expect(screen.getByRole('link', { name: 'Publishing' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.queryByRole('link', { name: 'Remix' }),
    ).not.toBeInTheDocument();
  });

  it('highlights Turbo for the Batch surface it runs on', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/turbo"
        pinnedAppIds={LAUNCHER_APP_IDS}
      />,
    );

    expect(screen.getByRole('link', { name: 'Turbo' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not classify focused artifact editors as Publishing', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/edit/article/article-1"
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Publishing' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('highlights Editor for the timeline surface', () => {
    // #2309: the editor is no longer a publish-adjacent surface.
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/editor/new"
        pinnedAppIds={LAUNCHER_APP_IDS}
      />,
    );

    expect(screen.getByRole('link', { name: 'Editor' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Publishing' }),
    ).not.toHaveAttribute('aria-current');
  });

  describe('active selection follows pin placement', () => {
    it.each([
      ['editor', '/studio/editor/project-1'],
      ['turbo', '/studio/turbo/project-1'],
      ['automation', '/automation/runs/run-1'],
      ['messages', '/messages/thread-1'],
      ['discovery', '/discovery/ads/ad-1'],
    ])(
      'shows nested %s selection only while the app is pinned to the rail',
      (appId, path) => {
        const props = {
          orgSlug: 'acme',
          brandSlug: 'my-brand',
          currentPath: `/acme/my-brand${path}`,
        };
        const view = render(<AppRail {...props} />);
        // Unpinned apps have no rail item, so nothing is selected.
        expect(screen.queryByTestId(`app-rail-item-${appId}`)).toBeNull();
        expect(
          view.container.querySelectorAll('[aria-current="page"]'),
        ).toHaveLength(0);

        view.rerender(<AppRail {...props} pinnedAppIds={[appId]} />);
        const pinned = screen.getByTestId(`app-rail-item-${appId}`);
        expect(pinned).toHaveAttribute('aria-current', 'page');
        expect(pinned).toHaveClass('bg-foreground/[0.12]', 'text-foreground');
        expect(
          view.container.querySelectorAll('[aria-current="page"]'),
        ).toHaveLength(1);

        view.rerender(<AppRail {...props} pinnedAppIds={[]} />);
        expect(screen.queryByTestId(`app-rail-item-${appId}`)).toBeNull();
        expect(
          view.container.querySelectorAll('[aria-current="page"]'),
        ).toHaveLength(0);
      },
    );

    it('recognizes nested organization-scope pinned app pages', () => {
      render(
        <AppRail
          orgSlug="acme"
          currentPath="/acme/~/automation/runs/run-1"
          pinnedAppIds={['automation']}
        />,
      );
      expect(screen.getByTestId('app-rail-item-automation')).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it.each([
      '/acme/my-brand/publishing/posts/post-1',
      '/acme/~/settings/brands',
    ])('leaves every pinned app unselected on %s', (currentPath) => {
      render(
        <AppRail
          orgSlug="acme"
          brandSlug="my-brand"
          currentPath={currentPath}
          pinnedAppIds={LAUNCHER_APP_IDS}
        />,
      );
      for (const appId of [
        'playground',
        'automation',
        'messages',
        'discovery',
      ]) {
        expect(
          screen.getByTestId(`app-rail-item-${appId}`),
        ).not.toHaveAttribute('aria-current');
      }
    });

    it('does not select a pinned app that its kill switch hides', () => {
      featureFlags.automation = false;
      const { container } = render(
        <AppRail
          orgSlug="acme"
          currentPath="/acme/~/automation/runs"
          pinnedAppIds={['automation']}
        />,
      );
      expect(screen.queryByTestId('app-rail-item-automation')).toBeNull();
      expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(
        0,
      );
    });
  });

  describe('route generation', () => {
    it('links to studio URL with brandSlug when provided', () => {
      render(
        <AppRail
          orgSlug="acme"
          brandSlug="my-brand"
          pinnedAppIds={LAUNCHER_APP_IDS}
        />,
      );
      expect(screen.getByRole('link', { name: 'Playground' })).toHaveAttribute(
        'href',
        '/acme/my-brand/studio/playground',
      );
    });

    it('links operate apps workspace, agent, messages, and automation', () => {
      render(
        <AppRail
          orgSlug="acme"
          brandSlug="my-brand"
          pinnedAppIds={LAUNCHER_APP_IDS}
        />,
      );

      expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
        'href',
        '/acme/my-brand/workspace/overview',
      );
      expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute(
        'href',
        '/acme/my-brand/agent',
      );
      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'href',
        '/acme/my-brand/messages',
      );
      expect(screen.getByRole('link', { name: 'Automation' })).toHaveAttribute(
        'href',
        '/acme/my-brand/automation/overview',
      );
    });

    it('uses org-scoped operate fallbacks when brandSlug is absent', () => {
      render(<AppRail orgSlug="acme" pinnedAppIds={LAUNCHER_APP_IDS} />);

      expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
        'href',
        '/acme/~/workspace/overview',
      );
      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'href',
        '/acme/~/messages',
      );
    });

    it('links to org-scoped create fallbacks when brandSlug is absent', () => {
      render(<AppRail orgSlug="acme" pinnedAppIds={LAUNCHER_APP_IDS} />);
      expect(screen.getByRole('link', { name: 'Playground' })).toHaveAttribute(
        'href',
        '/acme/~/studio/playground',
      );
    });

    it('routes brand apps to org views when brandSlug is absent', () => {
      render(<AppRail orgSlug="acme" pinnedAppIds={LAUNCHER_APP_IDS} />);

      for (const [label, href] of [
        ['Playground', '/acme/~/studio/playground'],
        ['Turbo', '/acme/~/studio/turbo'],
        ['Editor', '/acme/~/studio/editor'],
        ['Library', '/acme/~/library/assets'],
        ['Discovery', '/acme/~/discovery/overview'],
        ['Publishing', '/acme/~/publishing/overview'],
        ['Analytics', '/acme/~/analytics/overview'],
        ['Automation', '/acme/~/automation/overview'],
        ['Messages', '/acme/~/messages'],
      ] as const) {
        expect(screen.getByRole('link', { name: label })).toHaveAttribute(
          'href',
          href,
        );
      }
    });

    it('links to correct route for workspace app', () => {
      render(<AppRail orgSlug="acme" pinnedAppIds={LAUNCHER_APP_IDS} />);
      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/~/discovery/overview',
      );
    });

    it('links to brand-scoped workspace when a brand is selected', () => {
      render(
        <AppRail
          orgSlug="acme"
          brandSlug="my-brand"
          pinnedAppIds={LAUNCHER_APP_IDS}
        />,
      );
      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/my-brand/discovery/overview',
      );
    });

    it('links to correct route for analytics app', () => {
      render(<AppRail orgSlug="acme" />);

      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/~/analytics/overview',
      );
    });

    it('links brand app surfaces to brand-scoped routes', () => {
      render(<AppRail orgSlug="acme" brandSlug="my-brand" />);

      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/my-brand/analytics/overview',
      );
    });

    it('links brand-scoped module surfaces to their canonical routes', () => {
      render(
        <AppRail
          orgSlug="acme"
          brandSlug="my-brand"
          pinnedAppIds={LAUNCHER_APP_IDS}
        />,
      );

      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/my-brand/discovery/overview',
      );
      expect(screen.getByRole('link', { name: 'Publishing' })).toHaveAttribute(
        'href',
        '/acme/my-brand/publishing/overview',
      );
      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/my-brand/analytics/overview',
      );
    });

    it('falls brand-only module surfaces back to org-level defaults', () => {
      render(<AppRail orgSlug="acme" pinnedAppIds={LAUNCHER_APP_IDS} />);

      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/~/discovery/overview',
      );
      expect(
        screen.queryByRole('link', { name: 'Remix' }),
      ).not.toBeInTheDocument();
    });

    it('links to the brand-scoped Publishing module when a brand is selected', () => {
      render(
        <AppRail
          orgSlug="acme"
          brandSlug="my-brand"
          pinnedAppIds={LAUNCHER_APP_IDS}
        />,
      );
      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'href',
        '/acme/my-brand/messages',
      );

      expect(screen.getByRole('link', { name: 'Publishing' })).toHaveAttribute(
        'href',
        '/acme/my-brand/publishing/overview',
      );
    });

    it('places pinned apps after the core loop in pin order', () => {
      render(
        <AppRail orgSlug="acme" pinnedAppIds={['playground', 'messages']} />,
      );

      const analytics = screen.getByRole('link', { name: 'Analytics' });
      const studio = screen.getByRole('link', { name: 'Playground' });
      const messages = screen.getByRole('link', { name: 'Messages' });
      expect(
        analytics.compareDocumentPosition(studio) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        studio.compareDocumentPosition(messages) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Without handlers the rail is read-only: no pin controls anywhere.
      expect(
        screen.queryByRole('button', { name: /^(Unpin|Pin) / }),
      ).not.toBeInTheDocument();
    });

    it('preserves task context search params when switching apps', () => {
      render(
        <AppRail
          orgSlug="acme"
          preservedSearch="taskId=123&taskSource=workspace"
        />,
      );

      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/~/analytics/overview?taskId=123&taskSource=workspace',
      );
    });
  });

  describe('rail order and More', () => {
    const railIds = () =>
      screen
        .getAllByTestId(/^app-rail-item-/)
        .map((item) => item.dataset.testid?.replace('app-rail-item-', ''));

    it('applies the saved order and keeps unlisted apps after it', () => {
      render(
        <AppRail
          orgSlug="acme"
          pinnedAppIds={['playground', 'messages']}
          railAppOrder={['messages', 'agent', 'unknown']}
        />,
      );

      expect(railIds()).toEqual([
        'messages',
        'agent',
        'workspace',
        'library',
        'publishing',
        'analytics',
        'playground',
      ]);
    });

    it('numbers the daily shortcuts in the order the member sees', () => {
      clientSurface.isDesktop = true;
      render(
        <AppRail orgSlug="acme" railAppOrder={['analytics', 'workspace']} />,
      );

      const slot = screen.getByTestId('app-rail-slot-analytics');
      expect(within(slot).getByTestId('rail-tooltip')).toHaveTextContent('⌘ 1');
    });

    it('lists installed apps that are not on the rail in More, with a pin', () => {
      const onTogglePin = vi.fn();
      render(
        <AppRail
          orgSlug="acme"
          installedAppIds={['playground', 'turbo']}
          onTogglePin={onTogglePin}
          pinnedAppIds={['playground']}
        />,
      );

      expect(screen.queryByTestId('app-rail-more-menu')).toBeNull();
      fireEvent.click(screen.getByTestId('app-rail-more'));
      expect(screen.getByTestId('app-rail-more-item-turbo')).toHaveAttribute(
        'href',
        expect.stringContaining('/studio/turbo'),
      );
      expect(screen.queryByTestId('app-rail-more-item-playground')).toBeNull();
      fireEvent.click(screen.getByTestId('app-rail-more-pin-turbo'));
      expect(onTogglePin).toHaveBeenCalledWith('turbo');
    });

    it('shows no More entry when every installed app is on the rail', () => {
      render(
        <AppRail
          orgSlug="acme"
          installedAppIds={['playground']}
          pinnedAppIds={['playground']}
        />,
      );

      expect(screen.queryByTestId('app-rail-more')).toBeNull();
    });

    it('moves an app by dragging it onto another slot', () => {
      const onRailAppOrderChange = vi.fn();
      render(
        <AppRail orgSlug="acme" onRailAppOrderChange={onRailAppOrderChange} />,
      );
      const dataTransfer = { setData: vi.fn() };

      fireEvent.dragStart(screen.getByTestId('app-rail-slot-analytics'), {
        dataTransfer,
      });
      fireEvent.dragOver(screen.getByTestId('app-rail-slot-workspace'), {
        dataTransfer,
      });
      fireEvent.drop(screen.getByTestId('app-rail-slot-workspace'), {
        dataTransfer,
      });

      expect(onRailAppOrderChange).toHaveBeenCalledWith([
        'analytics',
        'workspace',
        'agent',
        'library',
        'publishing',
      ]);
    });

    it('moves the focused app with Alt+Arrow and announces it', () => {
      const onRailAppOrderChange = vi.fn();
      render(
        <AppRail orgSlug="acme" onRailAppOrderChange={onRailAppOrderChange} />,
      );

      fireEvent.keyDown(screen.getByTestId('app-rail-item-agent'), {
        altKey: true,
        key: 'ArrowDown',
      });

      expect(onRailAppOrderChange).toHaveBeenCalledWith([
        'workspace',
        'library',
        'agent',
        'publishing',
        'analytics',
      ]);
      expect(screen.getByRole('status')).toHaveTextContent(
        'Agent moved to position 3 of 5.',
      );
    });

    it('ignores plain arrows and is not reorderable without a handler', () => {
      const onRailAppOrderChange = vi.fn();
      const { unmount } = render(
        <AppRail orgSlug="acme" onRailAppOrderChange={onRailAppOrderChange} />,
      );
      fireEvent.keyDown(screen.getByTestId('app-rail-item-agent'), {
        key: 'ArrowDown',
      });
      expect(onRailAppOrderChange).not.toHaveBeenCalled();
      unmount();

      render(<AppRail orgSlug="acme" />);
      expect(
        screen.getByTestId('app-rail-slot-agent').getAttribute('draggable'),
      ).toBeNull();
    });

    it('opens an item menu on right click with move and unpin', () => {
      const onRailAppOrderChange = vi.fn();
      const onTogglePin = vi.fn();
      render(
        <AppRail
          orgSlug="acme"
          onRailAppOrderChange={onRailAppOrderChange}
          onTogglePin={onTogglePin}
        />,
      );

      expect(screen.queryByTestId('app-rail-item-menu')).toBeNull();
      fireEvent.contextMenu(screen.getByTestId('app-rail-slot-agent'), {
        clientX: 40,
        clientY: 120,
      });
      expect(screen.getByTestId('app-rail-item-menu')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('app-rail-item-menu-move-up'));
      expect(onRailAppOrderChange).toHaveBeenLastCalledWith([
        'agent',
        'workspace',
        'library',
        'publishing',
        'analytics',
      ]);
      expect(screen.queryByTestId('app-rail-item-menu')).toBeNull();

      // Core apps unpin too: they wait in More until pinned back.
      fireEvent.contextMenu(screen.getByTestId('app-rail-slot-library'));
      fireEvent.click(screen.getByTestId('app-rail-item-menu-unpin'));
      expect(onTogglePin).toHaveBeenCalledWith('library');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Library removed from your rail.',
      );
    });

    it('disables move up on the first item and move down on the last', () => {
      render(<AppRail orgSlug="acme" onRailAppOrderChange={vi.fn()} />);

      fireEvent.contextMenu(screen.getByTestId('app-rail-slot-workspace'));
      expect(screen.getByTestId('app-rail-item-menu-move-up')).toHaveAttribute(
        'data-disabled',
      );
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: 'Escape',
      });

      fireEvent.contextMenu(screen.getByTestId('app-rail-slot-analytics'));
      expect(
        screen.getByTestId('app-rail-item-menu-move-down'),
      ).toHaveAttribute('data-disabled');
    });

    it('offers only the handlers it was given in the item menu', () => {
      const { unmount } = render(
        <AppRail orgSlug="acme" onRailAppOrderChange={vi.fn()} />,
      );
      fireEvent.contextMenu(screen.getByTestId('app-rail-slot-agent'));
      expect(screen.getByTestId('app-rail-item-menu-move-down')).toBeVisible();
      expect(screen.queryByTestId('app-rail-item-menu-unpin')).toBeNull();
      unmount();

      render(<AppRail onTogglePin={vi.fn()} orgSlug="acme" />);
      fireEvent.contextMenu(screen.getByTestId('app-rail-slot-agent'));
      expect(screen.getByTestId('app-rail-item-menu-unpin')).toBeVisible();
      expect(screen.queryByTestId('app-rail-item-menu-move-up')).toBeNull();
    });

    it('leaves the browser menu alone with nothing to offer', () => {
      render(<AppRail orgSlug="acme" />);

      const wasNotCancelled = fireEvent.contextMenu(
        screen.getByTestId('app-rail-slot-agent'),
      );
      expect(wasNotCancelled).toBe(true);
      expect(screen.queryByTestId('app-rail-item-menu')).toBeNull();
    });

    it('moves a hidden core app into More and numbers shortcuts without it', () => {
      clientSurface.isDesktop = true;
      const onTogglePin = vi.fn();
      render(
        <AppRail
          hiddenAppIds={['agent']}
          onTogglePin={onTogglePin}
          orgSlug="acme"
        />,
      );

      expect(screen.queryByTestId('app-rail-item-agent')).toBeNull();
      expect(
        within(screen.getByTestId('app-rail-slot-library')).getByTestId(
          'rail-tooltip',
        ),
      ).toHaveTextContent('⌘ 2');
      fireEvent.click(screen.getByTestId('app-rail-more'));
      expect(screen.getByTestId('app-rail-more-item-agent')).toBeVisible();
      fireEvent.click(screen.getByTestId('app-rail-more-pin-agent'));
      expect(onTogglePin).toHaveBeenCalledWith('agent');
    });

    it('resets the rail from More', () => {
      const onResetRail = vi.fn();
      render(<AppRail onResetRail={onResetRail} orgSlug="acme" />);

      fireEvent.click(screen.getByTestId('app-rail-more'));
      fireEvent.click(screen.getByTestId('app-rail-reset'));
      expect(onResetRail).toHaveBeenCalledTimes(1);
    });

    it('reports where a moved app came from and landed', () => {
      const onReorderEvent = vi.fn();
      render(
        <AppRail
          onRailAppOrderChange={vi.fn()}
          onReorderEvent={onReorderEvent}
          orgSlug="acme"
          surface="desktop"
        />,
      );

      fireEvent.keyDown(screen.getByTestId('app-rail-item-agent'), {
        altKey: true,
        key: 'ArrowDown',
      });

      expect(onReorderEvent).toHaveBeenCalledWith({
        app: 'agent',
        from_index: 1,
        surface: 'desktop',
        to_index: 2,
      });
    });

    it('reports a dragged app to analytics', () => {
      const onReorderEvent = vi.fn();
      render(
        <AppRail
          onRailAppOrderChange={vi.fn()}
          onReorderEvent={onReorderEvent}
          orgSlug="acme"
          surface="desktop"
        />,
      );
      const dataTransfer = { setData: vi.fn() };

      fireEvent.dragStart(screen.getByTestId('app-rail-slot-analytics'), {
        dataTransfer,
      });
      fireEvent.drop(screen.getByTestId('app-rail-slot-workspace'), {
        dataTransfer,
      });

      expect(onReorderEvent).toHaveBeenCalledWith({
        app: 'analytics',
        from_index: 4,
        surface: 'desktop',
        to_index: 0,
      });
    });

    it('freezes reordering and More during the onboarding hold', () => {
      render(
        <AppRail
          orgSlug="acme"
          isNavigationSuspended
          onRailAppOrderChange={vi.fn()}
          onResetRail={vi.fn()}
        />,
      );

      expect(screen.getByTestId('app-rail-more')).toBeDisabled();
      expect(
        screen.getByTestId('app-rail-slot-agent').getAttribute('draggable'),
      ).toBeNull();
      fireEvent.contextMenu(screen.getByTestId('app-rail-slot-agent'));
      expect(screen.queryByTestId('app-rail-item-menu')).toBeNull();
    });
  });
});
