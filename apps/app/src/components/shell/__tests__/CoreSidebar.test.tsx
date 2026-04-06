import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CoreSidebar from '../CoreSidebar';

let mockPathname = '/workflows';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('CoreSidebar', () => {
  beforeEach(() => {
    mockPathname = '/workflows';
    vi.clearAllMocks();
  });

  it('renders the sidebar shell', () => {
    render(<CoreSidebar />);
    expect(screen.getByTestId('sidebar-shell')).toBeInTheDocument();
  });

  it('renders workspace navigation items', () => {
    render(<CoreSidebar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });

  it('renders tools section with label', () => {
    render(<CoreSidebar />);
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.getByText('Studio')).toBeInTheDocument();
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByText('Gallery')).toBeInTheDocument();
  });

  it('renders settings at the bottom', () => {
    render(<CoreSidebar />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders correct nav links', () => {
    render(<CoreSidebar />);
    const links = screen.getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/workspace/overview');
    expect(hrefs).toContain('/workflows');
    expect(hrefs).toContain('/studio');
    expect(hrefs).toContain('/editor');
    expect(hrefs).toContain('/gallery');
    expect(hrefs).toContain('/settings');
  });

  it('highlights active nav item based on pathname', () => {
    mockPathname = '/gallery';
    render(<CoreSidebar />);
    const galleryLink = screen.getByRole('link', { name: /Gallery/i });
    expect(galleryLink).toHaveClass('text-foreground');
  });

  it('renders collapse toggle when onToggleCollapse provided', () => {
    const onToggle = vi.fn();
    render(<CoreSidebar onToggleCollapse={onToggle} />);
    const toggleBtn = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggleBtn).toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows expand label when collapsed', () => {
    render(<CoreSidebar isCollapsed onToggleCollapse={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeInTheDocument();
  });

  it('fades body when collapsed', () => {
    const { container } = render(<CoreSidebar isCollapsed />);
    const body = container.querySelector('.opacity-0');
    expect(body).toBeInTheDocument();
  });

  it('calls onClose when nav link clicked', () => {
    const onClose = vi.fn();
    render(<CoreSidebar onClose={onClose} />);
    fireEvent.click(screen.getByText('Dashboard'));
    expect(onClose).toHaveBeenCalled();
  });
});
