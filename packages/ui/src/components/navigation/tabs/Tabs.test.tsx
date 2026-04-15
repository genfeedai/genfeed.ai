import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Tabs from '@ui/navigation/tabs/Tabs';
import { describe, expect, it, vi } from 'vitest';

// Mock next/navigation
let mockPathname = '/dashboard';
let mockSearch = '';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => ({
    toString: () => mockSearch,
  }),
}));

class MockIntersectionObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

describe('Tabs', () => {
  it('prefers an explicit activeTab for navigation tabs', () => {
    mockPathname = '/content/posts';
    mockSearch = '';

    render(
      <Tabs
        items={[
          { href: '/content/posts', id: 'drafts', label: 'Drafts' },
          {
            href: '/content/posts?status=scheduled',
            id: 'scheduled',
            label: 'Scheduled',
            matchMode: 'exact',
          },
        ]}
        activeTab="scheduled"
      />,
    );

    expect(screen.getByRole('link', { name: /scheduled/i })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('renders string tabs', () => {
    const handleTabChange = vi.fn();
    render(
      <Tabs
        tabs={['home', 'profile', 'settings']}
        activeTab="home"
        onTabChange={handleTabChange}
      />,
    );

    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.getByText('profile')).toBeInTheDocument();
    expect(screen.getByText('settings')).toBeInTheDocument();
  });

  it('renders object tabs', () => {
    const handleTabChange = vi.fn();
    render(
      <Tabs
        tabs={[
          { id: 'home', label: 'Home' },
          { id: 'profile', label: 'Profile' },
          { id: 'settings', label: 'Settings' },
        ]}
        activeTab="home"
        onTabChange={handleTabChange}
      />,
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('highlights active tab', () => {
    const handleTabChange = vi.fn();
    render(
      <Tabs
        tabs={['home', 'profile', 'settings']}
        activeTab="profile"
        onTabChange={handleTabChange}
      />,
    );

    const profileButton = screen.getByRole('tab', { name: /profile/i });
    expect(profileButton).toHaveAttribute('data-state', 'active');
  });

  it('calls onTabChange when tab is clicked', async () => {
    const user = userEvent.setup();
    const handleTabChange = vi.fn();
    render(
      <Tabs
        tabs={['home', 'profile', 'settings']}
        activeTab="home"
        onTabChange={handleTabChange}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /profile/i }));
    expect(handleTabChange).toHaveBeenCalledWith('profile');
  });

  it('renders tabs with badges', () => {
    const handleTabChange = vi.fn();
    render(
      <Tabs
        tabs={[
          { id: 'home', label: 'Home' },
          {
            badge: <span data-testid="badge">5</span>,
            id: 'notifications',
            label: 'Notifications',
          },
        ]}
        activeTab="home"
        onTabChange={handleTabChange}
      />,
    );

    expect(screen.getByTestId('badge')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('5');
  });

  it('disables tabs when isDisabled is true', () => {
    const handleTabChange = vi.fn();
    render(
      <Tabs
        tabs={[
          { id: 'home', label: 'Home' },
          { id: 'profile', isDisabled: true, label: 'Profile' },
        ]}
        activeTab="home"
        onTabChange={handleTabChange}
      />,
    );

    const profileButton = screen.getByRole('tab', { name: /profile/i });
    expect(profileButton).toBeDisabled();
  });

  it('does not call onTabChange for disabled tabs', async () => {
    const user = userEvent.setup();
    const handleTabChange = vi.fn();
    render(
      <Tabs
        tabs={[
          { id: 'home', label: 'Home' },
          { id: 'profile', isDisabled: true, label: 'Profile' },
        ]}
        activeTab="home"
        onTabChange={handleTabChange}
      />,
    );

    const profileButton = screen.getByRole('tab', { name: /profile/i });
    await user.click(profileButton);
    expect(handleTabChange).not.toHaveBeenCalled();
  });

  it('renders tabs with icons', () => {
    const handleTabChange = vi.fn();
    const HomeIcon = () => <span data-testid="home-icon">H</span>;

    render(
      <Tabs
        tabs={[
          { icon: HomeIcon, id: 'home', label: 'Home' },
          { id: 'profile', label: 'Profile' },
        ]}
        activeTab="home"
        onTabChange={handleTabChange}
      />,
    );

    expect(screen.getByTestId('home-icon')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const handleTabChange = vi.fn();
    const { container } = render(
      <Tabs
        tabs={['home', 'profile']}
        activeTab="home"
        onTabChange={handleTabChange}
        className="custom-class"
      />,
    );

    const tabsContainer = container.querySelector('.custom-class');
    expect(tabsContainer).toBeInTheDocument();
  });

  it('applies pills variant classes', () => {
    const handleTabChange = vi.fn();
    render(
      <Tabs
        tabs={['home', 'profile']}
        activeTab="home"
        onTabChange={handleTabChange}
        variant="pills"
      />,
    );

    const tabList = screen.getByRole('tablist');
    const activeTab = screen.getByRole('tab', { name: /home/i });

    expect(tabList).toHaveAttribute('data-variant', 'pills');
    expect(tabList).toHaveClass('rounded-2xl');
    expect(activeTab).toHaveAttribute('data-variant', 'pills');
  });

  it('renders navigation tabs with href as links', () => {
    const handleTabChange = vi.fn();
    render(
      <Tabs
        items={[
          { href: '/dashboard', id: 'dashboard', label: 'Dashboard' },
          { href: '/settings', id: 'settings', label: 'Settings' },
        ]}
        activeTab="dashboard"
        onTabChange={handleTabChange}
      />,
    );

    const settingsTab = screen.getByRole('link', { name: /settings/i });
    expect(settingsTab).toHaveAttribute('href', '/settings');
  });

  it('marks the active navigation tab with aria-current instead of tab semantics', () => {
    mockPathname = '/dashboard';
    mockSearch = '';

    render(
      <Tabs
        items={[
          { href: '/dashboard', id: 'dashboard', label: 'Dashboard' },
          { href: '/settings', id: 'settings', label: 'Settings' },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.queryByRole('tab', { name: /dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it('capitalizes non-navigation tab labels', () => {
    const handleTabChange = vi.fn();
    render(
      <Tabs
        tabs={[{ id: 'home', label: 'home' }]}
        activeTab="home"
        onTabChange={handleTabChange}
      />,
    );

    const homeSpan = screen.getByText('home').closest('span');
    expect(homeSpan).toHaveClass('capitalize');
  });

  it('matches route tabs by exact href when search params are present', () => {
    mockPathname = '/content/posts';
    mockSearch = 'status=scheduled';

    render(
      <Tabs
        items={[
          { href: '/content/posts', id: 'drafts', label: 'Drafts' },
          {
            href: '/content/posts?status=scheduled',
            id: 'scheduled',
            label: 'Scheduled',
            matchMode: 'exact',
          },
        ]}
        variant="pills"
      />,
    );

    expect(screen.getByRole('link', { name: /scheduled/i })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByRole('link', { name: /scheduled/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('supports explicit matchPaths for navigation tabs', () => {
    mockPathname = '/research/discovery';
    mockSearch = '';

    render(
      <Tabs
        items={[
          {
            href: '/research/socials',
            id: 'overview',
            label: 'Overview',
            matchPaths: ['/research/discovery', '/research/socials'],
          },
          { href: '/research/twitter', id: 'twitter', label: 'X' },
        ]}
        variant="pills"
      />,
    );

    expect(screen.getByRole('link', { name: /overview/i })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('applies underline variant classes', () => {
    mockPathname = '/dashboard';
    mockSearch = '';

    render(
      <Tabs
        items={[
          { id: 'selected', label: 'Selected' },
          { id: 'review', label: 'Review' },
        ]}
        activeTab="selected"
        variant="underline"
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('tablist')).toHaveAttribute(
      'data-variant',
      'underline',
    );
    expect(screen.getByRole('tab', { name: /selected/i })).toHaveAttribute(
      'data-variant',
      'underline',
    );
  });

  it('applies segmented variant and compact sizing', () => {
    mockPathname = '/dashboard';
    mockSearch = '';

    render(
      <Tabs
        items={[
          { id: 'compose', label: 'Compose' },
          { id: 'preview', label: 'Preview' },
        ]}
        activeTab="compose"
        size="sm"
        variant="segmented"
        fullWidth={false}
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('tablist')).toHaveAttribute(
      'data-variant',
      'segmented',
    );
    expect(screen.getByRole('tablist')).toHaveAttribute('data-size', 'sm');
    expect(screen.getByRole('tab', { name: /compose/i })).toHaveAttribute(
      'data-size',
      'sm',
    );
  });
});
