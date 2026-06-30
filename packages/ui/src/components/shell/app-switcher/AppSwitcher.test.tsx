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
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
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
      'Library',
      'Home',
      'Agent',
      'Create',
      'Publish',
      'Automate',
      'Analytics',
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

  it('marks the active app with aria-current="page"', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workflows" />);
    const activeButton = screen.getByRole('link', { name: 'Automate' });

    expect(activeButton).toHaveAttribute('aria-current', 'page');
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
    expect(screen.getByRole('link', { name: 'Analytics' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('active app button carries the shared shell active state', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen.getByRole('link', { name: 'Create' });
    expect(btn).toBeDefined();
    expect(btn).toHaveAttribute('aria-current', 'page');
    expect(btn).toHaveClass('bg-foreground/[0.06]');
  });

  it('inactive app button does not have active-state classes', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen.getByRole('link', { name: 'Publish' });
    expect(btn).not.toHaveAttribute('aria-current');
    expect(btn).not.toHaveClass('bg-foreground/[0.06]');
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
      expect(screen.getByRole('link', { name: 'Create' })).toHaveAttribute(
        'href',
        '/acme/my-brand/studio/image',
      );
    });

    it('links to org-scoped create when brandSlug is absent', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
      expect(screen.getByRole('link', { name: 'Create' })).toHaveAttribute(
        'href',
        '/acme/~/studio/image',
      );
    });

    it('routes brand apps to org views when brandSlug is absent', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);

      for (const [label, href] of [
        ['Library', '/acme/~/library'],
        ['Publish', '/acme/~/posts'],
        ['Create', '/acme/~/studio/image'],
        ['Automate', '/acme/~/workflows'],
      ] as const) {
        expect(screen.getByRole('link', { name: label })).toHaveAttribute(
          'href',
          href,
        );
      }
    });

    it('links to correct route for workspace app', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="studio" />);
      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
        'href',
        '/acme/~/overview',
      );
    });

    it('links to brand-scoped workspace when a brand is selected', () => {
      render(
        <AppSwitcher orgSlug="acme" currentApp="studio" brandSlug="my-brand" />,
      );
      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
        'href',
        '/acme/my-brand/workspace',
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

      expect(screen.getByRole('link', { name: 'Create' })).toHaveAttribute(
        'href',
        '/acme/my-brand/studio/image',
      );
      expect(screen.getByRole('link', { name: 'Automate' })).toHaveAttribute(
        'href',
        '/acme/my-brand/workflows',
      );
      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/my-brand/analytics/overview',
      );
    });

    it('links to the org-scoped agent app route', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
      expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute(
        'href',
        '/acme/~/chat',
      );
    });

    it('links to brand-scoped library pages when a brand is selected', () => {
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
        />,
      );
      expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute(
        'href',
        '/acme/my-brand/library/ingredients',
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

      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/~/analytics/overview?taskId=123&taskSource=workspace',
      );
    });
  });
});
