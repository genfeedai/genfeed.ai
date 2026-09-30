import { render, screen } from '@testing-library/react';
import { BreadcrumbNav } from '@ui/analytics/navigation/breadcrumb-nav/breadcrumb-nav';
import { describe, expect, it } from 'vitest';

describe('BreadcrumbNav', () => {
  const mockItems = [
    { href: '/analytics', label: 'Analytics' },
    { href: '/analytics/posts', label: 'Posts' },
    { label: 'Performance' },
  ];

  it('should render without crashing', () => {
    const { container } = render(<BreadcrumbNav items={mockItems} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render all breadcrumb items', () => {
    render(<BreadcrumbNav items={mockItems} />);
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Posts')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
  });

  it('should render links for non-last items with href', () => {
    render(<BreadcrumbNav items={mockItems} />);
    const analyticsLink = screen.getByText('Analytics').closest('a');
    expect(analyticsLink).toHaveAttribute('href', '/analytics');
  });

  it('should render last item as plain text', () => {
    render(<BreadcrumbNav items={mockItems} />);
    const lastItem = screen.getByText('Performance');
    expect(lastItem.tagName).toBe('SPAN');
    expect(lastItem).toHaveClass('font-medium');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <BreadcrumbNav items={mockItems} className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should handle single item', () => {
    render(<BreadcrumbNav items={[{ label: 'Home' }]} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
