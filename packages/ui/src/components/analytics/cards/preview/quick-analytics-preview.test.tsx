import '@ui/tests/mocks/recharts.mock';

import type { IAnalytics } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import { QuickAnalyticsPreview } from '@ui/analytics/cards/preview/quick-analytics-preview';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/charts', () => ({
  ChartContainer: ({
    children,
    className,
    height,
    style,
  }: {
    children: React.ReactNode;
    className?: string;
    height?: number | string;
    style?: React.CSSProperties;
  }) => (
    <div
      data-testid="responsive-container"
      className={className}
      style={{ ...style, height }}
    >
      {children}
    </div>
  ),
}));

describe('QuickAnalyticsPreview', () => {
  const mockAnalyticsData: IAnalytics = {
    activePlatforms: ['instagram', 'twitter', 'tiktok'],
    bestPerformingPlatform: 'instagram',
    createdAt: '2024-01-01T00:00:00.000Z',
    engagementGrowth: 8.3,
    id: 'analytics-1',
    totalComments: 500,
    totalLikes: 5000,
    totalPosts: 150,
    totalShares: 250,
    totalViews: 50000,
    updatedAt: '2024-01-01T00:00:00.000Z',
    viewsGrowth: 12.5,
  };

  describe('Loading State', () => {
    it('shows loading skeleton when isLoading is true', () => {
      const { container } = render(
        <QuickAnalyticsPreview data={null} isLoading={true} />,
      );
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('does not show data when loading', () => {
      render(
        <QuickAnalyticsPreview data={mockAnalyticsData} isLoading={true} />,
      );
      expect(screen.queryByText('Analytics Overview')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when data is null', () => {
      render(<QuickAnalyticsPreview data={null} />);
      expect(screen.getByText('Analytics Overview')).toBeInTheDocument();
      expect(
        screen.getByText('No analytics data available'),
      ).toBeInTheDocument();
    });

    it('shows "Go to Analytics" link in empty state', () => {
      render(<QuickAnalyticsPreview data={null} />);
      expect(
        screen.getByRole('link', { name: /go to analytics/i }),
      ).toBeInTheDocument();
    });

    it('uses custom moreLink in empty state', () => {
      render(<QuickAnalyticsPreview data={null} moreLink="/custom-link" />);
      const link = screen.getByRole('link', { name: /go to analytics/i });
      expect(link).toHaveAttribute('href', '/custom-link');
    });
  });

  describe('Rendering with Data', () => {
    it('renders default title', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      expect(screen.getByText('Analytics Overview')).toBeInTheDocument();
    });

    it('renders custom title', () => {
      render(
        <QuickAnalyticsPreview data={mockAnalyticsData} title="Custom Title" />,
      );
      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('displays "Last 7 days" timeframe', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    });
  });

  describe('Quick Stats Grid', () => {
    it('displays total posts', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('Total Posts')).toBeInTheDocument();
    });

    it('displays total views', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      expect(screen.getByText('50K')).toBeInTheDocument();
      expect(screen.getByText('Total Views')).toBeInTheDocument();
    });

    it('displays engagement (likes)', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      expect(screen.getByText('5K')).toBeInTheDocument();
      expect(screen.getByText('Engagement')).toBeInTheDocument();
    });

    it('displays growth percentage for views', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      expect(screen.getByText('+12.5%')).toBeInTheDocument();
    });

    it('displays growth percentage for engagement', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      expect(screen.getByText('+8.3%')).toBeInTheDocument();
    });

    it('applies green color for positive growth', () => {
      const { container } = render(
        <QuickAnalyticsPreview data={mockAnalyticsData} />,
      );
      const greenElements = container.querySelectorAll('.text-green-600');
      expect(greenElements.length).toBeGreaterThan(0);
    });

    it('applies red color for negative growth', () => {
      const negativeData = {
        ...mockAnalyticsData,
        engagementGrowth: -3.2,
        viewsGrowth: -5.0,
      };
      const { container } = render(
        <QuickAnalyticsPreview data={negativeData} />,
      );
      const redElements = container.querySelectorAll('.text-red-600');
      expect(redElements.length).toBeGreaterThan(0);
    });

    it('applies gray color for zero growth', () => {
      const zeroData = {
        ...mockAnalyticsData,
        engagementGrowth: 0,
        viewsGrowth: 0,
      };
      const { container } = render(<QuickAnalyticsPreview data={zeroData} />);
      const grayElements = container.querySelectorAll('.text-muted-foreground');
      expect(grayElements.length).toBeGreaterThan(0);
    });
  });

  describe('Active Platforms', () => {
    it('displays active platforms when available', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      const instagramElements = screen.getAllByText('Instagram');
      expect(instagramElements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Twitter')).toBeInTheDocument();
      expect(screen.getByText('Tiktok')).toBeInTheDocument();
    });

    it('does not show active platforms section when empty', () => {
      const noPlatformsData = {
        ...mockAnalyticsData,
        activePlatforms: [],
      };
      render(<QuickAnalyticsPreview data={noPlatformsData} />);
      expect(screen.queryByText('Active Platforms')).not.toBeInTheDocument();
    });

    it('does not show active platforms section when undefined', () => {
      const noPlatformsData = {
        ...mockAnalyticsData,
        activePlatforms: undefined,
      };
      render(<QuickAnalyticsPreview data={noPlatformsData} />);
      expect(screen.queryByText('Active Platforms')).not.toBeInTheDocument();
    });
  });

  describe('Best Performing Platform', () => {
    it('displays best performing platform when available', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      expect(screen.getByText('Best Performing Platform')).toBeInTheDocument();
      const instagramElements = screen.getAllByText('Instagram');
      expect(instagramElements.length).toBeGreaterThanOrEqual(1);
    });

    it('does not show best performing platform section when undefined', () => {
      const noBestPlatformData = {
        ...mockAnalyticsData,
        bestPerformingPlatform: undefined,
      };
      render(<QuickAnalyticsPreview data={noBestPlatformData} />);
      expect(
        screen.queryByText('Best Performing Platform'),
      ).not.toBeInTheDocument();
    });
  });

  describe('View More Link', () => {
    it('renders "View Detailed Analytics" link', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      expect(
        screen.getByRole('link', { name: /view detailed analytics/i }),
      ).toBeInTheDocument();
    });

    it('uses default moreLink', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      const link = screen.getByRole('link', {
        name: /view detailed analytics/i,
      });
      expect(link).toHaveAttribute('href', '/analytics');
    });

    it('uses custom moreLink', () => {
      render(
        <QuickAnalyticsPreview
          data={mockAnalyticsData}
          moreLink="/custom-analytics"
        />,
      );
      const link = screen.getByRole('link', {
        name: /view detailed analytics/i,
      });
      expect(link).toHaveAttribute('href', '/custom-analytics');
    });
  });

  describe('Number Formatting', () => {
    it('formats large numbers with compact notation', () => {
      const largeData = {
        ...mockAnalyticsData,
        totalLikes: 500000,
        totalViews: 1500000,
      };
      render(<QuickAnalyticsPreview data={largeData} />);
      expect(screen.getByText('1.5M')).toBeInTheDocument();
      expect(screen.getByText('500K')).toBeInTheDocument();
    });

    it('formats thousands correctly', () => {
      render(<QuickAnalyticsPreview data={mockAnalyticsData} />);
      expect(screen.getByText('50K')).toBeInTheDocument();
      expect(screen.getByText('5K')).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('applies custom className', () => {
      const { container } = render(
        <QuickAnalyticsPreview
          data={mockAnalyticsData}
          className="custom-class"
        />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
