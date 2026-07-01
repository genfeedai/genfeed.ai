import { render, screen } from '@testing-library/react';
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

vi.mock('../../../primitives/tooltip', () => ({
  SimpleTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@genfeedai/enums', () => ({
  ButtonSize: { ICON: 'icon', SM: 'sm', DEFAULT: 'default' },
  ButtonVariant: { GHOST: 'ghost', UNSTYLED: 'unstyled' },
}));

vi.mock('@genfeedai/helpers/formatting/cn/cn.util', () => ({
  cn: (...classes: (string | false | undefined | null)[]) =>
    classes.filter(Boolean).join(' '),
}));

// Import after mocks are set up
const { AppSwitcher } = await import('./AppSwitcher');

describe('AppSwitcher', () => {
  it('renders the active app label in the trigger button', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
    expect(
      screen.getByRole('button', {
        name: 'Switch section',
      }),
    ).toBeInTheDocument();
  });

  it('renders the first-level workspace sections', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
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
      'Batch',
      'Posts',
      'Messages',
      'Review',
      'Calendar',
      'Scheduled',
      'Overview',
      'Post Analytics',
      'Trend Analytics',
      'Repeat',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('link', { name: 'Admin' }),
    ).not.toBeInTheDocument();
  });

  it('renders the admin section only when enabled', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" showAdmin />);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });

  it('groups the first-level sections by workflow area', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);

    for (const label of ['Home', 'Trends', 'Create', 'Publish', 'Analytics']) {
      expect(screen.getByRole('group', { name: label })).toBeInTheDocument();
    }
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
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('active app button carries the shared shell active state', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen.getByRole('link', { name: 'Studio' });
    expect(btn).toBeDefined();
    expect(btn).toHaveAttribute('aria-current', 'page');
    expect(btn).toHaveClass('bg-foreground/[0.06]');
  });

  it('inactive app button does not have active-state classes', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen.getByRole('link', { name: 'Posts' });
    expect(btn).not.toHaveAttribute('aria-current');
    expect(btn).not.toHaveClass('bg-foreground/[0.06]');
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
        '/acme/~/agent',
      );
      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'href',
        '/acme/my-brand/workspace/inbox/unread',
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
        '/acme/~/workspace/inbox/unread',
      );
    });

    it('uses the inbox path to mark messages active inside the workspace app', () => {
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
          currentPath="/acme/my-brand/workspace/inbox/unread"
        />,
      );

      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(
        screen.getByRole('link', { name: 'Workspace' }),
      ).not.toHaveAttribute('aria-current');
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
        ['Posts', '/acme/~/posts'],
        ['Messages', '/acme/~/overview'],
        ['Remix', '/acme/~/posts'],
        ['Discovery', '/acme/~/overview'],
        ['Studio', '/acme/~/studio/image'],
        ['Library', '/acme/~/library'],
        ['Overview', '/acme/~/analytics/overview'],
      ] as const) {
        expect(screen.getByRole('link', { name: label })).toHaveAttribute(
          'href',
          href,
        );
      }
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
      expect(screen.getByRole('link', { name: 'Batch' })).toHaveAttribute(
        'href',
        '/acme/my-brand/studio/batch',
      );
      expect(
        screen.getByRole('link', { name: 'Post Analytics' }),
      ).toHaveAttribute('href', '/acme/my-brand/analytics/posts');
      expect(
        screen.getByRole('link', { name: 'Trend Analytics' }),
      ).toHaveAttribute('href', '/acme/my-brand/analytics/trends');
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
      expect(screen.getByRole('link', { name: 'Posts' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts',
      );
      expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute(
        'href',
        '/acme/my-brand/messages',
      );
      expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts/review',
      );
      expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute(
        'href',
        '/acme/my-brand/posts/calendar',
      );
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

      expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'href',
        '/acme/~/analytics/overview?taskId=123&taskSource=workspace',
      );
    });
  });
});
