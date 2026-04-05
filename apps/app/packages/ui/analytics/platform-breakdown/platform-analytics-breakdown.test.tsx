import { render, screen } from '@testing-library/react';
import PlatformAnalyticsBreakdown from '@ui/analytics/platform-breakdown/platform-analytics-breakdown';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/card/Card', () => ({
  default: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@helpers/formatting/format/format.helper', () => ({
  formatCompactNumber: (num: number) => num.toLocaleString(),
}));

describe('PlatformAnalyticsBreakdown', () => {
  const mockAnalytics = [
    {
      platform: 'twitter',
      summary: {
        totalComments: 10,
        totalLikes: 50,
        totalShares: 5,
        totalViews: 1000,
      },
    },
    {
      platform: 'instagram',
      summary: {
        totalComments: 20,
        totalLikes: 100,
        totalShares: 10,
        totalViews: 2000,
      },
    },
  ];

  it('should render without crashing', () => {
    const { container } = render(
      <PlatformAnalyticsBreakdown analytics={mockAnalytics} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render platform breakdown title', () => {
    render(<PlatformAnalyticsBreakdown analytics={mockAnalytics} />);
    expect(screen.getByText('Platform Breakdown')).toBeInTheDocument();
  });

  it('should render each platform', () => {
    render(<PlatformAnalyticsBreakdown analytics={mockAnalytics} />);
    expect(screen.getByText('twitter')).toBeInTheDocument();
    expect(screen.getByText('instagram')).toBeInTheDocument();
  });

  it('should display views for each platform', () => {
    render(<PlatformAnalyticsBreakdown analytics={mockAnalytics} />);
    expect(screen.getAllByText('Views').length).toBeGreaterThan(0);
  });

  it('should return null when analytics is empty', () => {
    const { container } = render(<PlatformAnalyticsBreakdown analytics={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should apply custom className', () => {
    render(
      <PlatformAnalyticsBreakdown
        analytics={mockAnalytics}
        className="custom-class"
      />,
    );
    expect(screen.getByTestId('card')).toHaveClass('custom-class');
  });
});
