import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
      studio: 'Studio',
      workspace: 'Workspace',
    },
    APP_ROUTES: {
      ADMIN: {
        OVERVIEW: {
          DASHBOARD: '/admin/overview/dashboard',
        },
      },
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
const { AppRail } = await import('./AppRail');

function openMoreMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
}

describe('AppRail', () => {
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
      'Go to Studio',
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
    expect(commands.registerCommands.mock.lastCall?.[0]).toHaveLength(10);
    expect(commands.registerCommands.mock.lastCall?.[0][9]).toMatchObject({
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
    render(<AppRail orgSlug="acme" brandSlug="my-brand" showAdmin />);
    openMoreMenu();
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('data-prefetch', 'false');
    }
  });

  it('renders the daily loop, then More, in rail order', () => {
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
    const analytics = screen.getByRole('link', { name: 'Analytics' });
    const more = screen.getByRole('button', { name: 'More' });
    const separator = screen.getByTestId('app-rail-pins-separator');
    expect(
      analytics.compareDocumentPosition(more) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      more.compareDocumentPosition(separator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    openMoreMenu();
    const overflow = ['Studio', 'Automation', 'Messages', 'Discovery'];
    const overflowLinks = overflow.map((label) =>
      screen.getByRole('link', { name: label }),
    );
    for (let index = 0; index < overflowLinks.length - 1; index += 1) {
      expect(
        overflowLinks[index].compareDocumentPosition(overflowLinks[index + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      ...labels,
      ...overflow,
    ]);
    for (const label of labels) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('link', { name: 'Research' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Batch' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Repeat' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Admin' }),
    ).not.toBeInTheDocument();
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

  it('locks gated apps behind the first asset and routes them to the agent', () => {
    render(<AppRail orgSlug="acme" brandSlug="my-brand" isAssetGateLocked />);

    for (const [label, id] of [
      ['Workspace', 'workspace'],
      ['Library', 'library'],
      ['Analytics', 'analytics'],
    ] as const) {
      const link = screen.getByRole('link', {
        name: `${label} — locked. Generate your first asset to unlock.`,
      });
      expect(link).toHaveAttribute('href', `/acme/my-brand/agent?locked=${id}`);
      expect(link).toHaveClass('opacity-60');
    }
    openMoreMenu();
    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
      'href',
      '/acme/my-brand/studio/generate',
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
    render(<AppRail orgSlug="acme" onNavigate={onNavigate} />);

    openMoreMenu();
    fireEvent.click(screen.getByRole('link', { name: 'Studio' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('renders Library with the images icon', () => {
    render(<AppRail orgSlug="acme" />);

    const libraryLink = screen.getByRole('link', { name: 'Library' });
    const icon = libraryLink.querySelector('svg');

    expect(icon).not.toBeNull();
    expect(icon?.classList.toString()).toMatch(/lucide-images/);
    expect(icon?.classList.toString()).not.toMatch(/lucide-briefcase/);
  });

  it('hides More when every overflow app is switched off', () => {
    featureFlags.studio = false;
    featureFlags.automation = false;
    featureFlags.messages = false;
    featureFlags.discovery = false;

    render(<AppRail orgSlug="acme" />);

    expect(
      screen.queryByRole('button', { name: 'More' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('app-rail-pins-separator'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
  });

  it('hides Studio when its app-switcher discovery flag is disabled', () => {
    featureFlags.studio = false;

    render(<AppRail orgSlug="acme" />);
    openMoreMenu();

    expect(
      screen.queryByRole('link', { name: 'Studio' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Messages' })).toBeInTheDocument();
  });

  it('independently hides every module whose discovery flag is disabled', () => {
    featureFlags.messages = false;
    featureFlags.automation = false;
    featureFlags.discovery = false;
    featureFlags.library = false;
    featureFlags.analytics = false;

    render(<AppRail orgSlug="acme" />);
    openMoreMenu();

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
    for (const label of ['Workspace', 'Agent', 'Studio', 'Publishing']) {
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
    expect(
      screen.queryByRole('button', { name: 'More' }),
    ).not.toBeInTheDocument();
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
    render(<AppRail orgSlug="acme" brandAwareSlug="moonrise" />);
    openMoreMenu();

    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
      'href',
      '/acme/moonrise/studio/generate',
    );
  });

  it('keeps the org studio fallback for an operator with no selected brand (#4671)', () => {
    render(<AppRail orgSlug="acme" />);
    openMoreMenu();

    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
      'href',
      '/acme/~/studio',
    );
  });

  it('marks messages active when the messages shell is current', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/messages"
      />,
    );
    openMoreMenu();

    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute(
      'data-active',
      'false',
    );
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

  it('badges the Messages item with its unread count', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        badges={{ messages: { count: 120, label: '120 unread conversations' } }}
      />,
    );
    expect(screen.getByTestId('app-rail-more-badge')).toHaveTextContent('99+');
    openMoreMenu();

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

  it('hides the Messages badge at zero', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        badges={{ messages: { count: 0, label: '0 unread conversations' } }}
      />,
    );
    expect(screen.queryByTestId('app-rail-more-badge')).not.toBeInTheDocument();
    openMoreMenu();

    expect(
      screen.queryByTestId('app-rail-badge-messages'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Messages' })).toBeInTheDocument();
  });

  it('does not highlight a product app on settings routes', () => {
    render(<AppRail orgSlug="acme" currentPath="/acme/~/settings/brands" />);
    openMoreMenu();

    for (const name of [
      'Workspace',
      'Agent',
      'Studio',
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

  it('marks studio active for any studio child path, not only the home href', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/clips"
      />,
    );
    openMoreMenu();

    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
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

  it('highlights nested studio routes under Studio', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/batch"
      />,
    );
    openMoreMenu();

    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
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

  it('highlights Studio for the Editor surface', () => {
    // #2309: the editor is no longer a publish-adjacent surface.
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/editor/new"
      />,
    );
    openMoreMenu();

    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Publishing' }),
    ).not.toHaveAttribute('aria-current');
  });

  describe('route generation', () => {
    it('links to studio URL with brandSlug when provided', () => {
      render(<AppRail orgSlug="acme" brandSlug="my-brand" />);
      openMoreMenu();
      expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
        'href',
        '/acme/my-brand/studio/generate',
      );
    });

    it('links operate apps workspace, agent, messages, and automation', () => {
      render(<AppRail orgSlug="acme" brandSlug="my-brand" />);
      openMoreMenu();

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
      render(<AppRail orgSlug="acme" />);
      openMoreMenu();

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
      render(<AppRail orgSlug="acme" />);
      openMoreMenu();
      expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
        'href',
        '/acme/~/studio',
      );
    });

    it('routes brand apps to org views when brandSlug is absent', () => {
      render(<AppRail orgSlug="acme" />);
      openMoreMenu();

      for (const [label, href] of [
        ['Studio', '/acme/~/studio'],
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
      render(<AppRail orgSlug="acme" />);
      openMoreMenu();
      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/~/discovery/overview',
      );
    });

    it('links to brand-scoped workspace when a brand is selected', () => {
      render(<AppRail orgSlug="acme" brandSlug="my-brand" />);
      openMoreMenu();
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
      render(<AppRail orgSlug="acme" brandSlug="my-brand" />);
      openMoreMenu();

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
      render(<AppRail orgSlug="acme" />);
      openMoreMenu();

      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/~/discovery/overview',
      );
      expect(
        screen.queryByRole('link', { name: 'Remix' }),
      ).not.toBeInTheDocument();
    });

    it('links to the brand-scoped Publishing module when a brand is selected', () => {
      render(<AppRail orgSlug="acme" brandSlug="my-brand" />);
      openMoreMenu();
      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'href',
        '/acme/my-brand/messages',
      );

      expect(screen.getByRole('link', { name: 'Publishing' })).toHaveAttribute(
        'href',
        '/acme/my-brand/publishing/overview',
      );
    });

    it('places pinned apps below More and its divider in pin order', () => {
      const onTogglePin = vi.fn();
      render(
        <AppRail
          orgSlug="acme"
          onTogglePin={onTogglePin}
          pinnedAppIds={['studio', 'messages']}
        />,
      );

      const analytics = screen.getByRole('link', { name: 'Analytics' });
      const separator = screen.getByTestId('app-rail-pins-separator');
      const studio = screen.getByRole('link', { name: 'Studio' });
      const more = screen.getByRole('button', { name: 'More' });
      const messages = screen.getByRole('link', { name: 'Messages' });
      expect(
        analytics.compareDocumentPosition(more) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        more.compareDocumentPosition(separator) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        separator.compareDocumentPosition(studio) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        studio.compareDocumentPosition(messages) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      openMoreMenu();
      fireEvent.click(screen.getByRole('button', { name: 'Unpin Studio' }));
      expect(onTogglePin).toHaveBeenCalledWith('studio');
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
});
