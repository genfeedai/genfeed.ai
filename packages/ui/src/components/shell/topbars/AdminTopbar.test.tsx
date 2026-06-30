import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const appSwitcherSpy = vi.hoisted(() => vi.fn());

vi.mock('@genfeedai/enums', () => ({
  ButtonSize: { ICON: 'icon' },
  ButtonVariant: { GHOST: 'ghost', OUTLINE: 'outline' },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    ariaLabel,
    'aria-label': ariaLabelAttribute,
  }: {
    children: ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    'aria-label'?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? ariaLabelAttribute}
    >
      {children}
    </button>
  ),
}));

vi.mock('@ui/shell/app-switcher/AppSwitcher', () => ({
  AppSwitcher: (props: {
    brandSlug?: string;
    currentApp: string;
    orgSlug: string;
    showAdmin?: boolean;
    variant?: string;
  }) => {
    appSwitcherSpy(props);
    return <div data-testid="app-switcher">{props.currentApp}</div>;
  },
}));

vi.mock('@ui/topbars/breadcrumbs/TopbarBreadcrumbs', () => ({
  default: ({ rootLabel }: { rootLabel: string }) => (
    <nav aria-label="Breadcrumbs">{rootLabel}</nav>
  ),
}));

const { default: AdminTopbar } = await import('./AdminTopbar');

describe('AdminTopbar', () => {
  it('renders the app switcher with the admin section active', () => {
    render(
      <AdminTopbar orgSlug="acme" brandSlug="brand" currentApp="workspace" />,
    );

    expect(screen.getByTestId('app-switcher')).toHaveTextContent('admin');
    expect(appSwitcherSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        brandSlug: 'brand',
        currentApp: 'admin',
        orgSlug: 'acme',
        showAdmin: true,
      }),
    );
  });

  it('does not render the switcher until route context is available', () => {
    render(<AdminTopbar />);

    expect(screen.queryByTestId('app-switcher')).not.toBeInTheDocument();
  });
});
