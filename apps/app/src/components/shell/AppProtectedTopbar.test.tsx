import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockSearchParams = new URLSearchParams();

vi.mock('@genfeedai/enums', () => ({
  ButtonSize: { ICON: 'icon' },
  ButtonVariant: { GHOST: 'ghost', UNSTYLED: 'unstyled' },
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandSlug: 'brand',
    href: (nextHref: string) => nextHref,
    orgHref: (nextHref: string) => `/acme/~${nextHref.replace(/^\//, '')}`,
    orgSlug: 'acme',
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
  useSearchParams: () => mockSearchParams,
}));

const { default: AppProtectedTopbar } = await import('./AppProtectedTopbar');

describe('AppProtectedTopbar', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
  });

  it('renders breadcrumbs before the right-side controls', () => {
    render(<AppProtectedTopbar />);

    const breadcrumbs = screen.getByTestId('breadcrumbs');
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');

    expect(breadcrumbs).toBeInTheDocument();
    expect(
      breadcrumbs.compareDocumentPosition(cloudSyncIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the cloud sync indicator beside the terminal dock control', () => {
    render(<AppProtectedTopbar isAgentCollapsed onAgentToggle={vi.fn()} />);

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
    render(<AppProtectedTopbar />);

    const credits = screen.getByTestId('topbar-credits-bar');
    const topbarEnd = screen.getByTestId('topbar-end');

    expect(
      credits.compareDocumentPosition(topbarEnd) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows task context with a scoped return link', () => {
    mockSearchParams = new URLSearchParams([
      ['taskId', 'task-1'],
      ['taskTitle', 'Launch plan'],
    ]);

    render(<AppProtectedTopbar />);

    expect(screen.getByText('Task context')).toBeInTheDocument();
    expect(screen.getByText('Launch plan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to task' })).toHaveAttribute(
      'href',
      '/workspace/overview?taskId=task-1',
    );
  });

  it('renders the settings cog as a navigation link', () => {
    render(<AppProtectedTopbar />);

    expect(screen.getByTitle('Settings')).toHaveAttribute(
      'href',
      '/acme/~/settings',
    );
  });

  it('renders close and expand controls for open mobile menu and collapsed sidebar', () => {
    render(
      <AppProtectedTopbar
        isMenuOpen
        isSidebarCollapsed
        onMenuToggle={vi.fn()}
        onSidebarToggle={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Close navigation menu' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeInTheDocument();
  });
});
