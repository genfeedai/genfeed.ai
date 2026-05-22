import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockPathname = '/acme/brand/workspace/overview';
let mockSearchParams = new URLSearchParams();
const pushSpy = vi.fn();
let capturedGenerationType: string | undefined;

vi.mock('@genfeedai/enums', () => ({
  ButtonSize: { ICON: 'icon' },
  ButtonVariant: { GHOST: 'ghost', UNSTYLED: 'unstyled' },
  GenerationType: {
    BLOG: 'blog',
    CLIP: 'clip',
    IMAGE: 'image',
    NEWSLETTER: 'newsletter',
    PODCAST: 'podcast',
    POST: 'post',
    THREAD: 'thread',
    VIDEO: 'video',
  },
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

vi.mock('@ui/shell/merged-switcher/MergedSwitcher', () => ({
  default: ({
    currentApp,
    currentGenerationType,
    onGenerationTypeChange,
    orgSlug,
    brandSlug,
  }: {
    currentApp?: string;
    currentGenerationType?: string;
    onGenerationTypeChange?: (generationType: string) => void;
    orgSlug?: string;
    brandSlug?: string;
  }) => {
    capturedGenerationType = currentGenerationType;

    return (
      <div data-testid="merged-switcher">
        {currentApp}:{orgSlug}:{brandSlug}:{currentGenerationType ?? 'none'}
        <button type="button" onClick={() => onGenerationTypeChange?.('image')}>
          Switch to image
        </button>
      </div>
    );
  },
}));

vi.mock('@ui/topbars/breadcrumbs/TopbarBreadcrumbs', () => ({
  default: () => <div data-testid="breadcrumbs">Breadcrumbs</div>,
}));

vi.mock('@ui/topbars/brand-switcher/TopbarBrandSwitcher', () => ({
  default: () => <div data-testid="brand-switcher" />,
}));

vi.mock('@ui/topbars/credits-bar/TopbarCreditsBar', () => ({
  default: () => <div data-testid="topbar-credits-bar">Credits</div>,
}));

vi.mock('@ui/topbars/end/TopbarEnd', () => ({
  default: () => <div data-testid="topbar-end">Topbar End</div>,
}));

vi.mock('@ui/topbars/organization-switcher/TopbarOrganizationSwitcher', () => ({
  default: () => <div data-testid="organization-switcher" />,
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
  usePathname: () => mockPathname,
  useRouter: () => ({ push: pushSpy }),
  useSearchParams: () => mockSearchParams,
}));

const { default: AppProtectedTopbar } = await import('./AppProtectedTopbar');

describe('AppProtectedTopbar', () => {
  beforeEach(() => {
    mockPathname = '/acme/brand/workspace/overview';
    mockSearchParams = new URLSearchParams();
    pushSpy.mockReset();
    capturedGenerationType = undefined;
  });

  it('renders breadcrumbs before the right-side controls', () => {
    render(<AppProtectedTopbar currentApp="workspace" orgSlug="acme" />);

    const breadcrumbs = screen.getByTestId('breadcrumbs');
    const cloudSyncIndicator = screen.getByTestId('cloud-sync-indicator');

    expect(breadcrumbs).toBeInTheDocument();
    expect(
      breadcrumbs.compareDocumentPosition(cloudSyncIndicator) &
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

  it('renders app, organization, and brand switchers in the protected chrome', () => {
    render(
      <AppProtectedTopbar
        currentApp="workspace"
        orgSlug="acme"
        brandSlug="brand"
      />,
    );

    expect(screen.getByTestId('merged-switcher')).toHaveTextContent(
      'workspace:acme:brand:none',
    );
    expect(screen.getByTestId('organization-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('brand-switcher')).toBeInTheDocument();
  });

  it('derives the active generation type from the protected route', () => {
    mockPathname = '/acme/brand/studio/video';

    render(
      <AppProtectedTopbar
        currentApp="studio"
        orgSlug="acme"
        brandSlug="brand"
      />,
    );

    expect(capturedGenerationType).toBe('video');
  });

  it.each([
    ['/acme/brand/studio', 'image'],
    ['/acme/brand/studio/image', 'image'],
    ['/acme/brand/studio/clips', 'clip'],
    ['/acme/brand/studio/music', 'podcast'],
  ])('maps %s to generation type %s', (pathname, expectedType) => {
    mockPathname = pathname;

    render(<AppProtectedTopbar currentApp="studio" />);

    expect(capturedGenerationType).toBe(expectedType);
  });

  it.each([
    '/acme/brand/compose/newsletter',
    '/acme/brand/compose/article',
    '/acme/brand/compose/post',
  ])('does not treat writing route %s as prompt generation', (pathname) => {
    mockPathname = pathname;

    render(<AppProtectedTopbar currentApp="compose" />);

    expect(capturedGenerationType).toBeUndefined();
  });

  it('routes generation type changes through the brand scoped URL', () => {
    mockSearchParams = new URLSearchParams([
      ['taskId', 'task-1'],
      ['type', 'legacy'],
    ]);

    render(
      <AppProtectedTopbar
        currentApp="studio"
        orgSlug="acme"
        brandSlug="brand"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch to image' }));

    expect(pushSpy).toHaveBeenCalledWith('/studio/image?taskId=task-1');
  });

  it('shows task context with a scoped return link', () => {
    mockSearchParams = new URLSearchParams([
      ['taskId', 'task-1'],
      ['taskTitle', 'Launch plan'],
    ]);

    render(<AppProtectedTopbar currentApp="workspace" orgSlug="acme" />);

    expect(screen.getByText('Task context')).toBeInTheDocument();
    expect(screen.getByText('Launch plan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to task' })).toHaveAttribute(
      'href',
      '/workspace/overview?taskId=task-1',
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
