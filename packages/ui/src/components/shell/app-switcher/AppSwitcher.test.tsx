import { fireEvent, render, screen } from '@testing-library/react';
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every APP_SWITCHER_FEATURE_FLAGS key must be listed: the mock falls back to
// `true`, so a missing key silently keeps its tile visible and the
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

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock Button — avoids deep @genfeedai/contracts + CVA dependency chain
vi.mock('../../../primitives/button', () => ({
  Button: ({
    children,
    onClick,
    ariaLabel,
    className,
    'aria-current': ariaCurrent,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    className?: string;
    'aria-current'?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
      aria-current={ariaCurrent}
    >
      {children}
    </button>
  ),
}));

vi.mock('../../../primitives/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="app-switcher-content">
      {children}
    </div>
  ),
  DropdownMenuGroup: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: ReactNode }) => (
    // Radix DropdownMenu.Group renders role="group"; mirror that so
    // getByRole('group') resolves the same as production.
    <div role="group" {...props}>
      {children}
    </div>
  ),
  DropdownMenuItem: ({
    asChild,
    children,
    className,
  }: {
    asChild?: boolean;
    children: ReactNode;
    className?: string;
  }) =>
    asChild && isValidElement(children) ? (
      cloneElement(
        children as ReactElement<{ className?: string }>,
        className ? { className } : undefined,
      )
    ) : (
      <button type="button" className={className}>
        {children}
      </button>
    ),
  DropdownMenuLabel: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@genfeedai/contracts', () => ({
  ButtonSize: { ICON: 'icon', SM: 'sm', DEFAULT: 'default' },
  ButtonVariant: { GHOST: 'ghost', UNSTYLED: 'unstyled' },
}));

// Mock the route builders — avoids pulling the full @genfeedai/contracts/constants barrel
// (carousel.constant.ts needs the real CredentialPlatform enum, which is not in
// the @genfeedai/contracts mock above). Mirrors packages/contracts/src/constants/routes.constant.ts.
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
const { AppSwitcher } = await import('./AppSwitcher');

describe('AppSwitcher', () => {
  beforeEach(() => {
    for (const key of Object.keys(featureFlags) as Array<
      keyof typeof featureFlags
    >) {
      featureFlags[key] = true;
    }
  });

  it('renders the active app label in the trigger button', () => {
    render(<AppSwitcher orgSlug="acme" />);
    expect(
      screen.getByRole('button', {
        name: 'Switch app',
      }),
    ).toBeInTheDocument();
  });

  it('keeps grayscale focus indicators on the trigger and app links', () => {
    const { rerender } = render(
      <AppSwitcher
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/workspace"
      />,
    );

    const iconTrigger = screen.getByRole('button', { name: 'Switch app' });
    expect(iconTrigger).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
      'focus-visible:ring-offset-background',
    );
    expect(iconTrigger.className).not.toContain('focus-visible:!ring-0');

    const workspaceLink = screen.getByRole('link', { name: 'Workspace' });
    expect(workspaceLink).toHaveAccessibleName('Workspace');
    expect(workspaceLink).toHaveAccessibleDescription('Command center.');
    const workspaceIconTile = workspaceLink.querySelector('span');
    expect(workspaceLink).toHaveClass(
      '!bg-transparent',
      '!shadow-none',
      '!ring-0',
      '!ring-offset-0',
    );
    expect(workspaceIconTile).toHaveClass('bg-foreground', 'text-background');
    const workspaceLabel = workspaceLink.querySelectorAll('span').item(1);
    expect(workspaceLabel).toHaveClass('whitespace-nowrap');
    expect(workspaceLabel).not.toHaveClass('truncate');

    rerender(
      <AppSwitcher
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/workspace"
        variant="labeled"
      />,
    );

    const labeledTrigger = screen.getByRole('button', { name: 'Switch app' });
    expect(labeledTrigger).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
      'focus-visible:ring-offset-background',
    );
    expect(labeledTrigger.className).not.toContain('focus-visible:!ring-0');
  });

  it('renders the compact primary app grid', () => {
    render(<AppSwitcher orgSlug="acme" />);

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    for (const label of [
      'Workspace',
      'Agent',
      'Messages',
      'Automation',
      'Studio',
      'Library',
      'Discovery',
      'Publishing',
      'Analytics',
    ]) {
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

  it('keeps a fixed launcher width and shows app details outside the panel', () => {
    const { container } = render(<AppSwitcher orgSlug="acme" />);

    const content = screen.getByTestId('app-switcher-content');
    const preview = container.querySelector('[data-app-switcher-preview]');
    const panel = container.querySelector('[data-app-switcher-panel]');
    const agentLink = screen.getByRole('link', { name: 'Agent' });

    vi.spyOn(panel as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 20,
    } as DOMRect);
    vi.spyOn(agentLink, 'getBoundingClientRect').mockReturnValue({
      top: 74,
    } as DOMRect);

    expect(content).toHaveClass(
      'sm:w-[16.25rem]',
      'bg-transparent',
      'shadow-none',
    );
    expect(preview).toHaveAttribute('data-state', 'closed');
    fireEvent.mouseEnter(agentLink);

    expect(preview).toHaveAttribute('data-state', 'open');
    expect(preview).toHaveStyle({ top: '54px' });
    expect(preview).toHaveClass(
      'right-[calc(100%+0.5rem)]',
      'w-60',
      'bg-secondary',
      'shadow-dropdown',
    );
    expect(preview?.querySelector('svg')).toBeInTheDocument();
    expect(preview).toHaveTextContent('Agent');
    expect(preview).toHaveTextContent('Ask and execute.');
    expect(content).toHaveClass('sm:w-[16.25rem]');
    expect(
      screen.queryByRole('status', { name: 'Agent: Ask and execute.' }),
    ).not.toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole('group', { name: 'Apps' }));
    expect(preview).toHaveAttribute('data-state', 'closed');
  });

  it('aligns hovered details with the app grid row', () => {
    const { container } = render(<AppSwitcher orgSlug="acme" />);
    const panel = container.querySelector('[data-app-switcher-panel]');
    const discoveryLink = screen.getByRole('link', { name: 'Discovery' });

    vi.spyOn(panel as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 20,
    } as DOMRect);
    vi.spyOn(discoveryLink, 'getBoundingClientRect').mockReturnValue({
      top: 226,
    } as DOMRect);

    fireEvent.mouseEnter(discoveryLink);

    expect(container.querySelector('[data-app-switcher-preview]')).toHaveStyle({
      top: '206px',
    });
  });

  it('keeps the preview stable while moving between app tiles', () => {
    const { container } = render(<AppSwitcher orgSlug="acme" />);
    const preview = container.querySelector('[data-app-switcher-preview]');
    const panel = container.querySelector('[data-app-switcher-panel]');
    const apps = screen.getByRole('group', { name: 'Apps' });
    const agentLink = screen.getByRole('link', { name: 'Agent' });
    const messagesLink = screen.getByRole('link', { name: 'Messages' });

    vi.spyOn(panel as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 20,
    } as DOMRect);
    vi.spyOn(agentLink, 'getBoundingClientRect').mockReturnValue({
      top: 74,
    } as DOMRect);
    vi.spyOn(messagesLink, 'getBoundingClientRect').mockReturnValue({
      top: 74,
    } as DOMRect);

    fireEvent.mouseEnter(agentLink);
    fireEvent.mouseLeave(apps);

    expect(preview).toHaveAttribute('data-state', 'closed');
    expect(preview).toHaveStyle({ top: '54px' });
    expect(preview).toHaveTextContent('Agent');

    fireEvent.mouseEnter(messagesLink);

    expect(preview).toHaveAttribute('data-state', 'open');
    expect(preview).toHaveStyle({ top: '54px' });
    expect(preview).not.toHaveTextContent('Agent');
    expect(preview).toHaveTextContent('Messages');
    expect(preview).toHaveTextContent('Reply to audience.');
  });

  it('hides Studio when its app-switcher discovery flag is disabled', () => {
    featureFlags.app_switcher_studio = false;

    render(<AppSwitcher orgSlug="acme" />);

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

    render(<AppSwitcher orgSlug="acme" />);

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

  it('hides the switcher when no modules are released', () => {
    for (const key of Object.keys(featureFlags) as Array<
      keyof typeof featureFlags
    >) {
      featureFlags[key] = false;
    }

    render(<AppSwitcher orgSlug="acme" />);

    expect(
      screen.queryByRole('button', { name: 'Switch app' }),
    ).not.toBeInTheDocument();
  });

  it('renders the admin app only when enabled', () => {
    render(<AppSwitcher orgSlug="acme" showAdmin />);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/admin/overview/dashboard',
    );
  });

  it('marks the active app with aria-current="page" from the product path root', () => {
    render(
      <AppSwitcher
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
      <AppSwitcher
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
      <AppSwitcher
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

  it('routes the agent tile to the selected brand when the current route is org-scoped', () => {
    render(<AppSwitcher orgSlug="acme" brandAwareSlug="moonrise" />);

    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute(
      'href',
      '/acme/moonrise/agent',
    );
    expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
      'href',
      '/acme/~/workspace/overview',
    );
  });

  it('marks messages active when the messages shell is current', () => {
    render(
      <AppSwitcher
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

  it('does not highlight a product app on settings routes', () => {
    render(
      <AppSwitcher orgSlug="acme" currentPath="/acme/~/settings/brands" />,
    );

    for (const name of [
      'Workspace',
      'Agent',
      'Messages',
      'Automation',
      'Studio',
      'Library',
      'Discovery',
      'Publishing',
      'Analytics',
    ]) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });

  it('marks studio active for any studio child path, not only the home href', () => {
    render(
      <AppSwitcher
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

  it('marks admin active when the admin shell renders the switcher', () => {
    render(
      <AppSwitcher
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
      <AppSwitcher
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/workspace"
      />,
    );

    expect(screen.getByRole('link', { name: 'Analytics' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('uses only the icon tile for the active visual state', () => {
    render(
      <AppSwitcher
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/storyboard"
      />,
    );
    const btn = screen.getByRole('link', { name: 'Studio' });
    const iconTile = btn.querySelector('span');

    expect(btn).toBeDefined();
    expect(btn).toHaveAttribute('aria-current', 'page');
    expect(btn).not.toHaveClass('bg-foreground/[0.08]');
    expect(iconTile).toHaveClass('bg-foreground', 'text-background');
  });

  it('inactive app button does not have active-state classes', () => {
    render(
      <AppSwitcher
        orgSlug="acme"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/storyboard"
      />,
    );

    const btn = screen.getByRole('link', { name: 'Publishing' });
    const iconTile = btn.querySelector('span');

    expect(btn).not.toHaveAttribute('aria-current');
    expect(btn).not.toHaveClass('bg-foreground/[0.08]');
    expect(iconTile).not.toHaveClass('bg-foreground', 'text-background');
    expect(iconTile).toHaveClass(
      'group-hover:bg-foreground',
      'group-hover:text-background',
      'group-focus-visible:bg-foreground',
      'group-focus-visible:text-background',
    );
  });

  it('keeps the contextual remix route inside Publishing', () => {
    render(
      <AppSwitcher
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
      <AppSwitcher
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
      <AppSwitcher
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
      <AppSwitcher
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
      render(<AppSwitcher orgSlug="acme" brandSlug="my-brand" />);
      expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
        'href',
        '/acme/my-brand/studio/generate',
      );
    });

    it('links operate apps workspace, agent, messages, and automation', () => {
      render(<AppSwitcher orgSlug="acme" brandSlug="my-brand" />);

      expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
        'href',
        '/acme/my-brand/workspace',
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
        '/acme/my-brand/automation',
      );
    });

    it('uses org-scoped operate fallbacks when brandSlug is absent', () => {
      render(<AppSwitcher orgSlug="acme" />);

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
      render(<AppSwitcher orgSlug="acme" />);
      expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
        'href',
        '/acme/~/studio',
      );
    });

    it('routes brand apps to org views when brandSlug is absent', () => {
      render(<AppSwitcher orgSlug="acme" />);

      for (const [label, href] of [
        ['Messages', '/acme/~/messages'],
        ['Automation', '/acme/~/automation'],
        ['Studio', '/acme/~/studio'],
        ['Library', '/acme/~/library'],
        ['Discovery', '/acme/~/discovery/overview'],
        ['Publishing', '/acme/~/publishing'],
        ['Analytics', '/acme/~/analytics'],
      ] as const) {
        expect(screen.getByRole('link', { name: label })).toHaveAttribute(
          'href',
          href,
        );
      }
    });

    it('links to correct route for workspace app', () => {
      render(<AppSwitcher orgSlug="acme" />);
      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/~/discovery/overview',
      );
    });

    it('links to brand-scoped workspace when a brand is selected', () => {
      render(<AppSwitcher orgSlug="acme" brandSlug="my-brand" />);
      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/my-brand/discovery/overview',
      );
    });

    it('labels the current FUD News brand and keeps Workspace on that brand', () => {
      render(<AppSwitcher orgSlug="demo" brandSlug="FUDNEWS" />);

      expect(screen.getByText('FUDNEWS')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
        'href',
        '/demo/FUDNEWS/workspace',
      );
      expect(screen.queryByText('Boxingcouple')).not.toBeInTheDocument();
    });

    it('links to correct route for analytics app', () => {
      render(<AppSwitcher orgSlug="acme" />);

      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/~/analytics',
      );
    });

    it('links brand app surfaces to brand-scoped routes', () => {
      render(<AppSwitcher orgSlug="acme" brandSlug="my-brand" />);

      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/my-brand/analytics',
      );
    });

    it('links brand-scoped module surfaces to their canonical routes', () => {
      render(<AppSwitcher orgSlug="acme" brandSlug="my-brand" />);

      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/my-brand/discovery/overview',
      );
      expect(screen.getByRole('link', { name: 'Publishing' })).toHaveAttribute(
        'href',
        '/acme/my-brand/publishing',
      );
      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/my-brand/analytics',
      );
    });

    it('falls brand-only module surfaces back to org-level defaults', () => {
      render(<AppSwitcher orgSlug="acme" />);

      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/~/discovery/overview',
      );
      expect(
        screen.queryByRole('link', { name: 'Remix' }),
      ).not.toBeInTheDocument();
    });

    it('links to the brand-scoped Publishing module when a brand is selected', () => {
      render(<AppSwitcher orgSlug="acme" brandSlug="my-brand" />);
      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'href',
        '/acme/my-brand/messages',
      );

      expect(screen.getByRole('link', { name: 'Publishing' })).toHaveAttribute(
        'href',
        '/acme/my-brand/publishing',
      );
    });

    it('preserves task context search params when switching apps', () => {
      render(
        <AppSwitcher
          orgSlug="acme"
          preservedSearch="taskId=123&taskSource=workspace"
        />,
      );

      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/~/analytics?taskId=123&taskSource=workspace',
      );
    });
  });
});
