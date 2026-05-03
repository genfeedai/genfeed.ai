import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/enums', () => ({
  ButtonVariant: { UNSTYLED: 'unstyled' },
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (nextHref: string) => nextHref,
  }),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    ariaLabel,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock('@ui/shell/app-switcher/AppSwitcher', () => ({
  AppSwitcher: () => <div data-testid="app-switcher">App Switcher</div>,
}));

vi.mock('@ui/topbars/breadcrumbs/TopbarBreadcrumbs', () => ({
  default: () => <div data-testid="breadcrumbs">Breadcrumbs</div>,
}));

vi.mock('@ui/topbars/credits-bar/TopbarCreditsBar', () => ({
  default: () => <div data-testid="topbar-credits-bar">Credits</div>,
}));

vi.mock('@ui/topbars/end/TopbarEnd', () => ({
  default: () => <div data-testid="topbar-end">Topbar End</div>,
}));

vi.mock('@/components/cloud-sync-indicator/CloudSyncIndicator', () => ({
  default: () => <div data-testid="cloud-sync-indicator" />,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const { default: AppProtectedTopbar } = await import('./AppProtectedTopbar');

describe('AppProtectedTopbar', () => {
  it('places the app switcher before breadcrumbs', () => {
    render(<AppProtectedTopbar currentApp="workspace" orgSlug="acme" />);

    const appSwitcher = screen.getByTestId('app-switcher');
    const breadcrumbs = screen.getByTestId('breadcrumbs');

    expect(appSwitcher).toBeInTheDocument();
    expect(breadcrumbs).toBeInTheDocument();
    expect(
      appSwitcher.compareDocumentPosition(breadcrumbs) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the cloud sync indicator beside the terminal dock control', () => {
    render(
      <AppProtectedTopbar
        currentApp="workspace"
        orgSlug="acme"
        isAgentCollapsed
        onAgentToggle={vi.fn()}
      />,
    );

    const terminalButton = screen.getByRole('button', {
      name: 'Open terminal dock',
    });
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');

    expect(
      terminalButton.compareDocumentPosition(cloudSyncIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders credit balances before the topbar end slot', () => {
    render(<AppProtectedTopbar currentApp="workspace" orgSlug="acme" />);

    const credits = screen.getByTestId('topbar-credits-bar');
    const topbarEnd = screen.getByTestId('topbar-end');

    expect(
      credits.compareDocumentPosition(topbarEnd) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
