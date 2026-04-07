import { Timeframe, TrendDirection } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import { GrowthTrendsCard } from '@ui/analytics/cards/growth-trends/growth-trends-card';
import { describe, expect, it } from 'vitest';

describe('GrowthTrendsCard', () => {
  const mockGrowthData = {
    bestDay: {
      date: '2024-01-15T00:00:00.000Z',
      views: 5000,
    },
    engagement: {
      current: 8500,
      growth: 1500,
      growthPercentage: 21.4,
      previous: 7000,
    },
    trendingDirection: TrendDirection.UP,
    views: {
      current: 12500,
      growth: 2500,
      growthPercentage: 25.0,
      previous: 10000,
    },
  };

  describe('Loading State', () => {
    it('shows loading skeleton when isLoading is true', () => {
      const { container } = render(
        <GrowthTrendsCard isLoading={true} growthData={null} />,
      );
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('does not show data when loading', () => {
      render(<GrowthTrendsCard isLoading={true} growthData={mockGrowthData} />);
      expect(screen.queryByText('Growth Trends')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when growthData is null', () => {
      render(<GrowthTrendsCard growthData={null} />);
      expect(screen.getByText('Growth Trends')).toBeInTheDocument();
      expect(screen.getByText('No growth data available')).toBeInTheDocument();
    });

    it('shows empty state when growthData is undefined', () => {
      render(<GrowthTrendsCard growthData={null} />);
      expect(screen.getByText('No growth data available')).toBeInTheDocument();
    });
  });

  describe('Rendering with Data', () => {
    it('renders title', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      expect(screen.getByText('Growth Trends')).toBeInTheDocument();
    });

    it('displays trending direction indicator for up trend', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      expect(screen.getByText('Trending Up')).toBeInTheDocument();
    });

    it('displays trending direction indicator for down trend', () => {
      const downTrendData = {
        ...mockGrowthData,
        trendingDirection: TrendDirection.DOWN,
      };
      render(<GrowthTrendsCard growthData={downTrendData} />);
      expect(screen.getByText('Trending Down')).toBeInTheDocument();
    });

    it('displays trending direction indicator for stable trend', () => {
      const stableTrendData = {
        ...mockGrowthData,
        trendingDirection: TrendDirection.STABLE,
      };
      render(<GrowthTrendsCard growthData={stableTrendData} />);
      expect(screen.getByText('Stable')).toBeInTheDocument();
    });
  });

  describe('Views Growth Section', () => {
    it('displays current views', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      const matches = screen.getAllByText('13K');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('displays views growth percentage', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      expect(screen.getByText('+25.0%')).toBeInTheDocument();
    });

    it('displays previous period views', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      expect(screen.getByText('10K')).toBeInTheDocument();
    });

    it('displays views change', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      expect(screen.getByText('2.5K')).toBeInTheDocument();
    });

    it('applies green color for positive growth', () => {
      const { container } = render(
        <GrowthTrendsCard growthData={mockGrowthData} />,
      );
      const greenElements = container.querySelectorAll('.text-green-600');
      expect(greenElements.length).toBeGreaterThan(0);
    });

    it('applies red color for negative growth', () => {
      const negativeGrowthData = {
        ...mockGrowthData,
        views: {
          ...mockGrowthData.views,
          growth: -1000,
          growthPercentage: -10.0,
        },
      };
      const { container } = render(
        <GrowthTrendsCard growthData={negativeGrowthData} />,
      );
      const redElements = container.querySelectorAll('.text-red-600');
      expect(redElements.length).toBeGreaterThan(0);
    });
  });

  describe('Engagement Growth Section', () => {
    it('displays current engagement', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      const matches = screen.getAllByText('8.5K');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('displays engagement growth percentage', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      expect(screen.getByText('+21.4%')).toBeInTheDocument();
    });

    it('displays previous period engagement', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      expect(screen.getByText('7K')).toBeInTheDocument();
    });
  });

  describe('Best Day Section', () => {
    it('displays best performing day date', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      expect(
        screen.getByText(/Jan 15, 2024|15, Jan 2024|15 Jan 2024/),
      ).toBeInTheDocument();
    });

    it('displays best day views', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      expect(screen.getByText('5K')).toBeInTheDocument();
    });
  });

  describe('Timeframe Label', () => {
    it('displays "Last 7 days" for 7d timeframe', () => {
      render(
        <GrowthTrendsCard
          growthData={mockGrowthData}
          timeframe={Timeframe.D7}
        />,
      );
      expect(
        screen.getByText(/comparing last 7 days vs previous period/i),
      ).toBeInTheDocument();
    });

    it('displays "Last 30 days" for 30d timeframe', () => {
      render(
        <GrowthTrendsCard
          growthData={mockGrowthData}
          timeframe={Timeframe.D30}
        />,
      );
      expect(
        screen.getByText(/comparing last 30 days vs previous period/i),
      ).toBeInTheDocument();
    });

    it('displays "Last 90 days" for 90d timeframe', () => {
      render(
        <GrowthTrendsCard
          growthData={mockGrowthData}
          timeframe={Timeframe.D90}
        />,
      );
      expect(
        screen.getByText(/comparing last 90 days vs previous period/i),
      ).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('applies custom className', () => {
      const { container } = render(
        <GrowthTrendsCard
          growthData={mockGrowthData}
          className="custom-class"
        />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Number Formatting', () => {
    it('formats large numbers with compact notation', () => {
      const largeData = {
        ...mockGrowthData,
        views: {
          ...mockGrowthData.views,
          current: 1500000,
        },
      };
      render(<GrowthTrendsCard growthData={largeData} />);
      const matches = screen.getAllByText('1.5M');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('formats percentage correctly', () => {
      render(<GrowthTrendsCard growthData={mockGrowthData} />);
      expect(screen.getByText('+25.0%')).toBeInTheDocument();
      expect(screen.getByText('+21.4%')).toBeInTheDocument();
    });

    it('formats negative percentage correctly', () => {
      const negativeData = {
        ...mockGrowthData,
        views: {
          ...mockGrowthData.views,
          growthPercentage: -15.5,
        },
      };
      render(<GrowthTrendsCard growthData={negativeData} />);
      expect(screen.getByText('-15.5%')).toBeInTheDocument();
    });
  });
});
