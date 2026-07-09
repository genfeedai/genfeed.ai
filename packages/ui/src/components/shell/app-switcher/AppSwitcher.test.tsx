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
      'Research',
      'Studio',
      'Remix',
      'Library',
      'Publish',
      'Analytics',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('link', { name: 'Discovery' }),
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

  it('searches module destinations', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);

    searchApps('analytics');

    expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Post Analytics' }),
    ).not.toBeInTheDocument();
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
    const activeButton = screen.getByRole('link', { name: 'Publish' });

    expect(activeButton).toHaveAttribute('aria-current', 'page');
  });

  it('marks the operator agent item active on the agent surface', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="agent" />);

    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('routes the agent tile to the selected brand when the current route is org-scoped', () => {
    render(
      <AppSwitcher
        orgSlug="acme"
        currentApp="workspace"
        brandAwareSlug="moonrise"
      />,
    );

    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute(
      'href',
      '/acme/moonrise/agent',
    );
    expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
      'href',
      '/acme/~/overview',
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

    expect(screen.getByRole('link', { name: 'Analytics' })).not.toHaveAttribute(
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
    searchApps('publish');

    const btn = screen.getByRole('link', { name: 'Publish' });
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

    expect(screen.getByRole('link', { name: 'Publish' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('highlights nested studio routes under Studio', () => {
    render(
      <AppSwitcher
        orgSlug="acme"
        currentApp="studio"
        brandSlug="my-brand"
        currentPath="/acme/my-brand/studio/batch"
      />,
    );

    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
      'aria-current',
      'page',
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
        '/acme/~/overview',
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
        ['Research', '/acme/~/overview'],
        ['Studio', '/acme/~/studio/image'],
        ['Library', '/acme/~/library'],
        ['Publish', '/acme/~/posts'],
        ['Analytics', '/acme/~/analytics/overview'],
      ] as const) {
        expect(screen.getByRole('link', { name: label })).toHaveAttribute(
          'href',
          href,
        );
      }
    });

    it('links to correct route for workspace app', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="studio" />);
      expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute(
        'href',
        '/acme/~/overview',
      );
    });

    it('links to brand-scoped workspace when a brand is selected', () => {
      render(
        <AppSwitcher orgSlug="acme" currentApp="studio" brandSlug="my-brand" />,
      );
      expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute(
        'href',
        '/acme/my-brand/research/discovery',
      );
    });

    it('links to correct route for analytics app', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);

      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
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
      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/my-brand/analytics/overview',
      );
    });

    it('links brand-scoped module surfaces to their canonical routes', () => {
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
        />,
      );

      expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute(
        'href',
        '/acme/my-brand/research/discovery',
      );
      expect(screen.getByRole('link', { name: 'Remix' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts/remix',
      );
      expect(screen.getByRole('link', { name: 'Publish' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts',
      );
      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/my-brand/analytics/overview',
      );
    });

    it('falls brand-only module surfaces back to org-level defaults', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);

      expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute(
        'href',
        '/acme/~/overview',
      );
      expect(screen.getByRole('link', { name: 'Remix' })).toHaveAttribute(
        'href',
        '/acme/~/posts',
      );
    });

    it('links to the brand-scoped publish module when a brand is selected', () => {
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

      expect(screen.getByRole('link', { name: 'Publish' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts',
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
      searchApps('analytics');

      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/~/analytics/overview?taskId=123&taskSource=workspace',
      );
    });
  });
});
