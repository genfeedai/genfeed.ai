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
    'data-active': dataActive,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    className?: string;
    'aria-current'?: string;
    'data-active'?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
      aria-current={ariaCurrent}
      data-active={dataActive}
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
      cloneElement(children as ReactElement<{ className?: string }>, {
        className,
      })
    ) : (
      <button type="button" className={className}>
        {children}
      </button>
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
        name: 'Current app: Workspace. Click to switch apps.',
      }),
    ).toBeInTheDocument();
  });

  it('renders content apps first and platform apps after the divider', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
    for (const label of [
      'Library',
      'Posts',
      'Workspace',
      'Agent',
      'Studio',
      'Workflows',
      'Editor',
      'Compose',
      'Analytics',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('marks the active app with aria-current="page"', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workflows" />);
    const activeButton = screen.getByRole('link', { name: 'Workflows' });

    expect(activeButton).toHaveAttribute('aria-current', 'page');
  });

  it('does not set aria-current on inactive app buttons', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
    expect(screen.getByRole('link', { name: 'Analytics' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('active app button carries the shared shell active state', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen.getByRole('link', { name: 'Compose' });
    expect(btn).toBeDefined();
    expect(btn).toHaveAttribute('data-active', 'true');
  });

  it('inactive app button does not have active-state classes', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen.getByRole('link', { name: 'Editor' });
    expect(btn).not.toHaveAttribute('data-active', 'true');
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

    it('links to org overview for studio when brandSlug is absent', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
      expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
        'href',
        '/acme/~/overview',
      );
    });

    it('links to correct route for workspace app', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="studio" />);
      expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
        'href',
        '/acme/~/overview',
      );
    });

    it('links to correct route for analytics app', () => {
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'href',
        '/acme/~/analytics/overview',
      );
    });

    it('links to the org-scoped chat app route for Agent', () => {
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
      expect(screen.getByRole('link', { name: 'Posts' })).toHaveAttribute(
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
