import { render, screen } from '@testing-library/react';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Create a mutable reference for the pathname that tests can modify
let currentPathname = '/dashboard/settings/profile';

// Mock next/navigation at module level
vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

describe('Breadcrumb', () => {
  beforeEach(() => {
    // Reset to default pathname before each test
    currentPathname = '/dashboard/settings/profile';
  });

  it('renders breadcrumb from pathname', () => {
    const { container } = render(<Breadcrumb />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('dashboard')).toBeInTheDocument();
    expect(screen.getByText('settings')).toBeInTheDocument();
    expect(screen.getByText('profile')).toBeInTheDocument();
  });

  it('renders custom segments', () => {
    const segments = [
      { href: '/', label: 'Home' },
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/dashboard/settings', label: 'Settings' },
    ];

    render(<Breadcrumb segments={segments} />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders links for non-last segments', () => {
    const segments = [
      { href: '/', label: 'Home' },
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/dashboard/settings', label: 'Settings' },
    ];

    render(<Breadcrumb segments={segments} />);

    const homeLink = screen.getByText('Home').closest('a');
    const dashboardLink = screen.getByText('Dashboard').closest('a');

    expect(homeLink).toHaveAttribute('href', '/');
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
  });

  it('renders last segment as span', () => {
    const segments = [
      { href: '/', label: 'Home' },
      { href: '/dashboard', label: 'Dashboard' },
    ];

    render(<Breadcrumb segments={segments} />);

    const lastSegment = screen.getByText('Dashboard');
    expect(lastSegment.tagName).toBe('SPAN');
  });

  it('applies custom className', () => {
    const segments = [{ href: '/', label: 'Home' }];

    render(<Breadcrumb segments={segments} className="custom-class" />);

    const nav = screen.getByRole('navigation');
    expect(nav).toHaveClass('custom-class');
  });

  it('returns null when no segments provided', () => {
    const { container } = render(<Breadcrumb segments={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when pathname is root', () => {
    currentPathname = '/';
    const { container } = render(<Breadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it('capitalizes segment labels', () => {
    const segments = [
      { href: '/dashboard', label: 'dashboard' },
      { href: '/dashboard/settings', label: 'settings' },
    ];

    render(<Breadcrumb segments={segments} />);

    const items = screen.getAllByRole('listitem');
    items.forEach((item) => {
      expect(item).toHaveClass('capitalize');
    });
  });

  it('decodes URI components in pathname', () => {
    currentPathname = '/dashboard/my%20project';
    render(<Breadcrumb />);
    // The component should decode "my%20project" to "my project"
    expect(screen.getByText('my project')).toBeInTheDocument();
  });

  it('replaces dashes with spaces in labels', () => {
    currentPathname = '/dashboard/my-awesome-project';
    render(<Breadcrumb />);
    expect(screen.getByText('my awesome project')).toBeInTheDocument();
  });

  it('handles deep nested paths', () => {
    currentPathname = '/a/b/c/d/e';
    render(<Breadcrumb />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
    expect(screen.getByText('d')).toBeInTheDocument();
    expect(screen.getByText('e')).toBeInTheDocument();
  });

  it('renders single segment correctly', () => {
    currentPathname = '/dashboard';
    const { container } = render(<Breadcrumb />);
    expect(container.firstChild).toBeInTheDocument();
    const dashboardElement = screen.getByText('dashboard');
    // Single segment should be rendered as span (last element)
    expect(dashboardElement.tagName).toBe('SPAN');
  });
});
