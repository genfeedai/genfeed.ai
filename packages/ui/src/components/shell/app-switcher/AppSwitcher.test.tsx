import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Capture the router push spy before mocking so tests can assert on it
const pushSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
}));

// Mock Button — avoids deep @genfeedai/enums + CVA dependency chain
vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
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

// Mock Popover — render children directly, no portal/floating logic
vi.mock('@ui/primitives/popover', () => ({
  Popover: ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) => <>{children}</>,
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
  ButtonSize: { SM: 'sm', DEFAULT: 'default' },
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

  it('renders all 6 app buttons in the grid', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
    for (const label of [
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
    expect(screen.getByRole('button', { name: 'Workflows' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not set aria-current on inactive app buttons', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="workspace" />);
    expect(
      screen.getByRole('button', { name: 'Analytics' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('active app button carries ring design-token class', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen.getByRole('button', { name: 'Compose' });
    expect(btn.className).toContain('ring-2');
    expect(btn.className).toContain('ring-[var(--gen-accent-primary)]');
  });

  it('inactive app button does not have the active ring design-token class', () => {
    render(<AppSwitcher orgSlug="acme" currentApp="compose" />);
    const btn = screen.getByRole('button', { name: 'Editor' });
    expect(btn.className).not.toContain('ring-[var(--gen-accent-primary)]');
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
  });
});
