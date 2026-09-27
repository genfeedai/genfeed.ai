import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every APP_SWITCHER_FEATURE_FLAGS key must be listed: the mock falls back to
// `true`, so a missing key silently keeps its item visible and the
// no-modules-released case can never reach zero.
const featureFlags = vi.hoisted(() => ({
  app_switcher_agent: true,
  app_switcher_analytics: true,
  app_switcher_automate: true,
  app_switcher_library: true,
  app_switcher_messages: true,
  app_switcher_posts: true,
  app_switcher_discover: true,
  app_switcher_studio: true,
  app_switcher_workspace: true,
}));

vi.mock('@genfeedai/hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: (flagKey: string) =>
    featureFlags[flagKey as keyof typeof featureFlags] ?? true,
}));

const router = vi.hoisted(() => ({ prefetch: vi.fn() }));
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
vi.mock('../../../primitives/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../primitives/separator', () => ({
  Separator: ({ className, ...props }: { className?: string }) => (
    <div className={className} {...props} />
  ),
}));

// Mock the route builders — avoids pulling the full @genfeedai/contracts/constants
// barrel. Mirrors packages/contracts/src/constants/routes.constant.ts.
vi.mock('@genfeedai/contracts/constants', () => {
  const normalize = (routePath: string) =>
    routePath.length === 0 || routePath === '/'
      ? ''
      : routePath.startsWith('/')
        ? routePath
        : `/${routePath}`;
  return {
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
    APP_SWITCHER_FEATURE_FLAGS: {
      workspace: 'app_switcher_workspace',
      agent: 'app_switcher_agent',
      messages: 'app_switcher_messages',
      automation: 'app_switcher_automate',
      discovery: 'app_switcher_discover',
      studio: 'app_switcher_studio',
      library: 'app_switcher_library',
      publishing: 'app_switcher_posts',
      analytics: 'app_switcher_analytics',
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

describe('AppRail', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    router.prefetch.mockClear();
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
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('data-prefetch', 'false');
    }
  });

  it('renders every app in rail order with Agent first', () => {
    render(<AppRail orgSlug="acme" />);

    expect(
      screen.getByRole('navigation', { name: 'Apps' }),
    ).toBeInTheDocument();

    const labels = [
      'Agent',
      'Workspace',
      'Studio',
      'Library',
      'Publishing',
      'Messages',
      'Discovery',
      'Analytics',
      'Automation',
    ];
    const links = screen.getAllByRole('link');

    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual(
      labels,
    );
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

  it('pins Admin below the product apps', () => {
    render(<AppRail orgSlug="acme" showAdmin />);

    const labels = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'));

    expect(labels.at(-1)).toBe('Admin');
    expect(labels.at(-2)).toBe('Automation');
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

    fireEvent.click(screen.getByRole('link', { name: 'Studio' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('renders Library with the stacked-assets icon, not a briefcase', () => {
    render(<AppRail orgSlug="acme" />);

    const libraryLink = screen.getByRole('link', { name: 'Library' });
    const icon = libraryLink.querySelector('svg');

    expect(icon).not.toBeNull();
    expect(icon?.classList.toString()).toMatch(/lucide-layers/);
    expect(icon?.classList.toString()).not.toMatch(/lucide-briefcase/);
  });

  it('separates the daily loop from the secondary apps with one divider', () => {
    render(<AppRail orgSlug="acme" />);

    const divider = screen.getByTestId('app-rail-divider');
    const messages = screen.getByRole('link', { name: 'Messages' });
    const discovery = screen.getByRole('link', { name: 'Discovery' });

    expect(screen.getAllByTestId('app-rail-divider')).toHaveLength(1);
    expect(
      messages.compareDocumentPosition(divider) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      divider.compareDocumentPosition(discovery) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('drops the divider when every secondary app is hidden', () => {
    featureFlags.app_switcher_discover = false;
    featureFlags.app_switcher_analytics = false;
    featureFlags.app_switcher_automate = false;

    render(<AppRail orgSlug="acme" />);

    expect(screen.queryByTestId('app-rail-divider')).not.toBeInTheDocument();
  });

  it('hides Studio when its app-switcher discovery flag is disabled', () => {
    featureFlags.app_switcher_studio = false;

    render(<AppRail orgSlug="acme" />);

    expect(
      screen.queryByRole('link', { name: 'Studio' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
  });

  it('independently hides every module whose discovery flag is disabled', () => {
    featureFlags.app_switcher_messages = false;
    featureFlags.app_switcher_automate = false;
    featureFlags.app_switcher_discover = false;
    featureFlags.app_switcher_library = false;
    featureFlags.app_switcher_analytics = false;

    render(<AppRail orgSlug="acme" />);

    // 'Discovery' is the tile's label — asserting on 'Research' passed
    // vacuously because no tile carries that name any more.
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

  it('renders no app links when no modules are released', () => {
    for (const key of Object.keys(featureFlags) as Array<
      keyof typeof featureFlags
    >) {
      featureFlags[key] = false;
    }

    render(<AppRail orgSlug="acme" />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
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

    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
      'href',
      '/acme/moonrise/studio/generate',
    );
  });

  it('keeps the org studio fallback for an operator with no selected brand (#4671)', () => {
    render(<AppRail orgSlug="acme" />);

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

    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('badges the Messages item with its unread count', () => {
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        badges={{ messages: { count: 120, label: '120 unread conversations' } }}
      />,
    );

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

    expect(
      screen.queryByTestId('app-rail-badge-messages'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Messages' })).toBeInTheDocument();
  });

  it('does not highlight a product app on settings routes', () => {
    render(<AppRail orgSlug="acme" currentPath="/acme/~/settings/brands" />);

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

  it('highlights Studio for the merged edit surface', () => {
    // #2309: the editor is no longer a publish-adjacent surface.
    render(
      <AppRail
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/edit/new"
      />,
    );

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
      expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
        'href',
        '/acme/my-brand/studio/generate',
      );
    });

    it('links operate apps workspace, agent, messages, and automation', () => {
      render(<AppRail orgSlug="acme" brandSlug="my-brand" />);

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
      expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
        'href',
        '/acme/~/studio',
      );
    });

    it('routes brand apps to org views when brandSlug is absent', () => {
      render(<AppRail orgSlug="acme" />);

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
      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/~/discovery/overview',
      );
    });

    it('links to brand-scoped workspace when a brand is selected', () => {
      render(<AppRail orgSlug="acme" brandSlug="my-brand" />);
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
      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'href',
        '/acme/my-brand/messages',
      );

      expect(screen.getByRole('link', { name: 'Publishing' })).toHaveAttribute(
        'href',
        '/acme/my-brand/publishing/overview',
      );
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
