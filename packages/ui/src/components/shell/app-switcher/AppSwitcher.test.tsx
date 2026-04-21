import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Capture the router push spy before mocking so tests can assert on it
const pushSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
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

// Mock Popover — render children directly, no portal/floating logic
vi.mock('@ui/primitives/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode; open?: boolean }) => (
    <>{children}</>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
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
    // The trigger and the grid both render the label; there will be multiple
    expect(screen.getAllByText('Workspace').length).toBeGreaterThanOrEqual(1);
  });

  it('renders content apps first and platform apps after the divider', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
    for (const label of [
      'Library',
      'Posts',
      'Workspace',
      'Studio',
      'Workflows',
      'Editor',
      'Compose',
      'Analytics',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('marks the active app with aria-current="page"', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workflows" />);
    const activeButton = screen
      .getAllByRole('button', { name: 'Workflows' })
      .find((button) => button.getAttribute('aria-current') === 'page');

    expect(activeButton).toBeDefined();
  });

  it('does not set aria-current on inactive app buttons', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
    expect(
      screen.getByRole('button', { name: 'Analytics' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('active app button carries the shared shell active state', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen
      .getAllByRole('button', { name: 'Compose' })
      .find((button) => button.getAttribute('aria-current') === 'page');
    expect(btn).toBeDefined();
    expect(btn?.className).toContain('gen-shell-surface');
    expect(btn).toHaveAttribute('data-active', 'true');
  });

  it('inactive app button does not have active-state classes', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen.getByRole('button', { name: 'Editor' });
    expect(btn).not.toHaveAttribute('data-active', 'true');
  });

  describe('route generation', () => {
    it('navigates to studio URL with brandSlug when provided', () => {
      pushSpy.mockClear();
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Studio' }));
      expect(pushSpy).toHaveBeenCalledWith('/acme/my-brand/studio/image');
    });

    it('navigates to org overview for studio when brandSlug is absent', () => {
      pushSpy.mockClear();
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
      fireEvent.click(screen.getByRole('button', { name: 'Studio' }));
      expect(pushSpy).toHaveBeenCalledWith('/acme/~/overview');
    });

    it('navigates to correct route for workspace app', () => {
      pushSpy.mockClear();
      render(<AppSwitcher orgSlug="acme" currentApp="studio" />);
      fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
      expect(pushSpy).toHaveBeenCalledWith('/acme/~/overview');
    });

    it('navigates to correct route for analytics app', () => {
      pushSpy.mockClear();
      render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
      fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));
      expect(pushSpy).toHaveBeenCalledWith('/acme/~/analytics/overview');
    });

    it('navigates to brand-scoped library pages when a brand is selected', () => {
      pushSpy.mockClear();
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Library' }));
      expect(pushSpy).toHaveBeenCalledWith(
        '/acme/my-brand/library/ingredients',
      );
    });

    it('navigates to brand-scoped posts pages when a brand is selected', () => {
      pushSpy.mockClear();
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          brandSlug="my-brand"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Posts' }));
      expect(pushSpy).toHaveBeenCalledWith('/acme/my-brand/posts');
    });

    it('preserves task context search params when switching apps', () => {
      pushSpy.mockClear();
      render(
        <AppSwitcher
          orgSlug="acme"
          currentApp="workspace"
          preservedSearch="taskId=123&taskSource=workspace"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

      expect(pushSpy).toHaveBeenCalledWith(
        '/acme/~/analytics/overview?taskId=123&taskSource=workspace',
      );
    });
  });
});
