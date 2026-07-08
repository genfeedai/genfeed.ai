import { fireEvent, render, screen } from '@testing-library/react';
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

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

// Mock Button — avoids deep @genfeedai/enums + CVA dependency chain
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
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
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

vi.mock('../../../primitives/input', () => ({
  Input: ({
    ref: _ref,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & {
    ref?: React.Ref<HTMLInputElement>;
  }) => <input {...props} />,
}));

vi.mock('../../../primitives/tooltip', () => ({
  SimpleTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@genfeedai/enums', () => ({
  ButtonSize: { ICON: 'icon', SM: 'sm', DEFAULT: 'default' },
  ButtonVariant: { GHOST: 'ghost', UNSTYLED: 'unstyled' },
}));

// Mock the route builders — avoids pulling the full @genfeedai/constants barrel
// (carousel.constant.ts needs the real CredentialPlatform enum, which is not in
// the @genfeedai/enums mock above). Mirrors packages/constants/src/routes.constant.ts.
vi.mock('@genfeedai/constants', () => {
  const normalize = (routePath: string) =>
    routePath.length === 0 || routePath === '/'
      ? ''
      : routePath.startsWith('/')
        ? routePath
        : `/${routePath}`;
  return {
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

function searchApps(query: string) {
  fireEvent.change(
    screen.getByRole('searchbox', {
      name: 'Search apps',
    }),
    {
      target: {
        value: query,
      },
    },
  );
}

describe('AppSwitcher', () => {
  it('renders the active app label in the trigger button', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
    expect(
      screen.getByRole('button', {
        name: 'Switch app',
      }),
    ).toBeInTheDocument();
  });

  it('renders the compact primary app grid', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);

    expect(
      screen.getByRole('searchbox', { name: 'Search apps' }),
    ).toBeInTheDocument();

    for (const label of [
      'Workspace',
      'Agent',
      'Messages',
      'Discovery',
      'Socials',
      'Ads',
      'Studio',
      'Remix',
      'Library',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('link', { name: 'Posts' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Admin' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces secondary destinations through search', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);

    searchApps('analytics');

    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Post Analytics' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Trend Analytics' }),
    ).toBeInTheDocument();
  });

  it('renders the admin app only when enabled and searched', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" showAdmin />);

    searchApps('admin');

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });

  it('marks the active app with aria-current="page"', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="posts" />);
    const activeButton = screen.getByRole('link', { name: 'Posts' });

    expect(activeButton).toHaveAttribute('aria-current', 'page');
  });

  it('marks the operator agent item active on the agent surface', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="agent" />);

    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('marks messages active when the messages shell is current', () => {
    render(
      <AppSwitcher orgSlug="acme" brandSlug="my-brand" currentApp="messages" />,
    );

    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('marks admin active when the admin shell renders the switcher', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="admin" showAdmin />);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not set aria-current on inactive app buttons', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
    searchApps('analytics');

    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('active app button carries the shared shell active state', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen.getByRole('link', { name: 'Studio' });
    expect(btn).toBeDefined();
    expect(btn).toHaveAttribute('aria-current', 'page');
    expect(btn).toHaveClass('bg-foreground/[0.08]');
  });

  it('inactive app button does not have active-state classes', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    searchApps('posts');

    const btn = screen.getByRole('link', { name: 'Posts' });
    expect(btn).not.toHaveAttribute('aria-current');
    expect(btn).not.toHaveClass('bg-foreground/[0.08]');
  });

  it('uses the most specific current path for active state', () => {
    render(
      <AppSwitcher
        orgSlug="acme"
        currentApp="posts"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/posts/remix"
      />,
    );

    expect(screen.getByRole('link', { name: 'Remix' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    searchApps('posts');
    expect(screen.getByRole('link', { name: 'Posts' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('highlights nested studio routes under their concrete create entry', () => {
    render(
      <AppSwitcher
        orgSlug="acme"
        currentApp="studio"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/batch"
      />,
    );

    expect(screen.getByRole('link', { name: 'Batch' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Studio' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  describe('route generation', () => {
    it('links to studio URL with brandSlug when provided', () => {
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
        />,
      );
      expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
        'href',
        '/acme/my-brand/studio/image',
      );
    });

    it('links the operate section to workspace, agent, and messages', () => {
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
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
    });

    it('uses org-scoped operate fallbacks when brandSlug is absent', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);

      expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
        'href',
        '/acme/~/workspace/overview',
      );
      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'href',
        '/acme/~/overview',
      );
    });

    it('links to org-scoped create fallbacks when brandSlug is absent', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
      expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
        'href',
        '/acme/~/studio/image',
      );
    });

    it('routes brand apps to org views when brandSlug is absent', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);

      for (const [label, href] of [
        ['Messages', '/acme/~/overview'],
        ['Remix', '/acme/~/posts'],
        ['Discovery', '/acme/~/overview'],
        ['Studio', '/acme/~/studio/image'],
        ['Library', '/acme/~/library'],
      ] as const) {
        expect(screen.getByRole('link', { name: label })).toHaveAttribute(
          'href',
          href,
        );
      }

      searchApps('posts');
      expect(screen.getByRole('link', { name: 'Posts' })).toHaveAttribute(
        'href',
        '/acme/~/posts',
      );

      searchApps('overview');
      expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'href',
        '/acme/~/analytics/overview',
      );
    });

    it('links to correct route for workspace app', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="studio" />);
      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/~/overview',
      );
    });

    it('links to brand-scoped workspace when a brand is selected', () => {
      render(
        <AppSwitcher orgSlug="acme" currentApp="studio" brandSlug="my-brand" />,
      );
      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/my-brand/research/discovery',
      );
    });

    it('links to correct route for analytics app', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
      searchApps('overview');

      expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'href',
        '/acme/~/analytics/overview',
      );
    });

    it('links brand app surfaces to brand-scoped routes', () => {
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
        />,
      );

      expect(screen.getByRole('link', { name: 'Remix' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts/remix',
      );
      searchApps('overview');
      expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'href',
        '/acme/my-brand/analytics/overview',
      );
    });

    it('links brand-scoped loop surfaces to their canonical routes', () => {
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
        />,
      );

      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/my-brand/research/discovery',
      );
      expect(screen.getByRole('link', { name: 'Socials' })).toHaveAttribute(
        'href',
        '/acme/my-brand/research/socials',
      );
      expect(screen.getByRole('link', { name: 'Ads' })).toHaveAttribute(
        'href',
        '/acme/my-brand/research/ads',
      );
      expect(screen.getByRole('link', { name: 'Remix' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts/remix',
      );

      searchApps('batch');
      expect(screen.getByRole('link', { name: 'Batch' })).toHaveAttribute(
        'href',
        '/acme/my-brand/studio/batch',
      );

      searchApps('post analytics');
      expect(
        screen.getByRole('link', { name: 'Post Analytics' }),
      ).toHaveAttribute('href', '/acme/my-brand/analytics/posts');

      searchApps('trend analytics');
      expect(
        screen.getByRole('link', { name: 'Trend Analytics' }),
      ).toHaveAttribute('href', '/acme/my-brand/analytics/trends');

      searchApps('repeat');
      expect(screen.getByRole('link', { name: 'Repeat' })).toHaveAttribute(
        'href',
        '/acme/my-brand/workflows',
      );
    });

    it('falls brand-only loop surfaces back to org-level defaults', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);

      expect(screen.getByRole('link', { name: 'Discovery' })).toHaveAttribute(
        'href',
        '/acme/~/overview',
      );
      expect(screen.getByRole('link', { name: 'Remix' })).toHaveAttribute(
        'href',
        '/acme/~/posts',
      );
    });

    it('links to brand-scoped posts pages when a brand is selected', () => {
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
        />,
      );
      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'href',
        '/acme/my-brand/messages',
      );

      searchApps('posts');
      expect(screen.getByRole('link', { name: 'Posts' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts',
      );

      searchApps('review');
      expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts/review',
      );

      searchApps('calendar');
      expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts/calendar',
      );

      searchApps('scheduled');
      expect(screen.getByRole('link', { name: 'Scheduled' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts/scheduled',
      );
    });

    it('preserves task context search params when switching apps', () => {
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          preservedSearch="taskId=123&taskSource=workspace"
        />,
      );
      searchApps('overview');

      expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'href',
        '/acme/~/analytics/overview?taskId=123&taskSource=workspace',
      );
    });
  });
});
