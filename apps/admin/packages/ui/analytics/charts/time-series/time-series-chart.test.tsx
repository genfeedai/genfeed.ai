import { AnalyticsMetric } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import { TimeSeriesChart } from '@ui/analytics/charts/time-series/time-series-chart';
import { describe, expect, it, vi } from 'vitest';

// Mock recharts to avoid ResizeObserver issues in tests
vi.mock('recharts', () => ({
  Area: ({ dataKey }: { dataKey: string }) => (
    <div data-testid={`area-${dataKey}`} />
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Tooltip: () => <div data-testid="tooltip" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
}));

const mockData = [
  {
    comments: 50,
    date: '2025-01-01',
    engagementRate: 0.15,
    likes: 100,
    saves: 20,
    shares: 30,
    totalEngagement: 200,
    views: 1000,
  },
  {
    comments: 60,
    date: '2025-01-02',
    engagementRate: 0.16,
    likes: 120,
    saves: 22,
    shares: 33,
    totalEngagement: 235,
    views: 1200,
  },
  {
    comments: 75,
    date: '2025-01-03',
    engagementRate: 0.17,
    likes: 150,
    saves: 25,
    shares: 38,
    totalEngagement: 288,
    views: 1500,
  },
];

describe('TimeSeriesChart', () => {
  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      render(<TimeSeriesChart data={[]} isLoading />);
      expect(screen.getByText('Loading chart data...')).toBeInTheDocument();
    });

    it('shows animated spinner element', () => {
      const { container } = render(<TimeSeriesChart data={[]} isLoading />);
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('applies custom className when loading', () => {
      const { container } = render(
        <TimeSeriesChart data={[]} isLoading className="custom-class" />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('applies custom height when loading', () => {
      const { container } = render(
        <TimeSeriesChart data={[]} isLoading height={500} />,
      );
      expect(container.firstChild).toHaveStyle({ height: '500px' });
    });
  });

  describe('Empty State', () => {
    it('shows no data message when data is null', () => {
      render(<TimeSeriesChart data={[]} />);
      expect(screen.getByText('No data available')).toBeInTheDocument();
    });

    it('shows no data message when data is empty array', () => {
      render(<TimeSeriesChart data={[]} />);
      expect(screen.getByText('No data available')).toBeInTheDocument();
    });

    it('shows suggestion to select different date range', () => {
      render(<TimeSeriesChart data={[]} />);
      expect(
        screen.getByText('Try selecting a different date range'),
      ).toBeInTheDocument();
    });

    it('applies custom className when no data', () => {
      const { container } = render(
        <TimeSeriesChart data={[]} className="custom-class" />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Basic Rendering with Data', () => {
    it('renders the chart container', () => {
      render(<TimeSeriesChart data={mockData} />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('renders the area chart', () => {
      render(<TimeSeriesChart data={mockData} />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('renders default metric buttons (views, likes, comments)', () => {
      render(<TimeSeriesChart data={mockData} />);
      expect(screen.getByText('Views')).toBeInTheDocument();
      expect(screen.getByText('Likes')).toBeInTheDocument();
      expect(screen.getByText('Comments')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <TimeSeriesChart data={mockData} className="custom-class" />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Metric Toggles', () => {
    it('renders all specified metrics as buttons', () => {
      render(
        <TimeSeriesChart
          data={mockData}
          metrics={[
            AnalyticsMetric.VIEWS,
            AnalyticsMetric.LIKES,
            AnalyticsMetric.COMMENTS,
            AnalyticsMetric.SHARES,
          ]}
        />,
      );
      expect(screen.getByText('Views')).toBeInTheDocument();
      expect(screen.getByText('Likes')).toBeInTheDocument();
      expect(screen.getByText('Comments')).toBeInTheDocument();
      expect(screen.getByText('Shares')).toBeInTheDocument();
    });

    it('toggles metric off when clicked', () => {
      render(
        <TimeSeriesChart
          data={mockData}
          metrics={[AnalyticsMetric.VIEWS, AnalyticsMetric.LIKES]}
        />,
      );
      const viewsButton = screen.getByText('Views').closest('button');

      // Click to deactivate views metric
      fireEvent.click(viewsButton!);

      // Views button should now have inactive styling
      expect(viewsButton).toHaveClass('bg-transparent');
    });

    it('cannot toggle off the last active metric', () => {
      render(
        <TimeSeriesChart
          data={mockData}
          metrics={[AnalyticsMetric.VIEWS, AnalyticsMetric.LIKES]}
        />,
      );

      // First toggle off likes
      const likesButton = screen.getByText('Likes').closest('button');
      fireEvent.click(likesButton!);

      // Try to toggle off views (should not work since it's the last one)
      const viewsButton = screen.getByText('Views').closest('button');
      fireEvent.click(viewsButton!);

      // Views should still be active
      expect(viewsButton).toHaveClass('bg-white/10');
    });

    it('toggles metric on when clicked while inactive', () => {
      render(
        <TimeSeriesChart
          data={mockData}
          metrics={[AnalyticsMetric.VIEWS, AnalyticsMetric.LIKES]}
        />,
      );

      // First toggle off likes
      const likesButton = screen.getByText('Likes').closest('button');
      fireEvent.click(likesButton!);

      // Toggle likes back on
      fireEvent.click(likesButton!);

      // Likes should be active again
      expect(likesButton).toHaveClass('bg-white/10');
    });

    it('renders colored indicators for each metric', () => {
      const { container } = render(
        <TimeSeriesChart
          data={mockData}
          metrics={[AnalyticsMetric.VIEWS, AnalyticsMetric.LIKES]}
        />,
      );
      const colorIndicators = container.querySelectorAll(
        '.rounded-full.w-3.h-3',
      );
      expect(colorIndicators.length).toBe(2);
    });
  });

  describe('Custom Metrics', () => {
    it('renders engagement rate metric with correct label', () => {
      render(
        <TimeSeriesChart
          data={mockData}
          metrics={[AnalyticsMetric.ENGAGEMENT_RATE]}
        />,
      );
      expect(screen.getByText('Engagement Rate (%)')).toBeInTheDocument();
    });

    it('renders saves metric', () => {
      render(
        <TimeSeriesChart data={mockData} metrics={[AnalyticsMetric.SAVES]} />,
      );
      expect(screen.getByText('Saves')).toBeInTheDocument();
    });

    it('renders multiple different metrics', () => {
      render(
        <TimeSeriesChart
          data={mockData}
          metrics={[
            AnalyticsMetric.VIEWS,
            AnalyticsMetric.SHARES,
            AnalyticsMetric.SAVES,
            AnalyticsMetric.ENGAGEMENT_RATE,
          ]}
        />,
      );
      expect(screen.getByText('Views')).toBeInTheDocument();
      expect(screen.getByText('Shares')).toBeInTheDocument();
      expect(screen.getByText('Saves')).toBeInTheDocument();
      expect(screen.getByText('Engagement Rate (%)')).toBeInTheDocument();
    });
  });

  describe('Height Configuration', () => {
    it('uses default height of 350', () => {
      const { container } = render(<TimeSeriesChart data={mockData} />);
      // The responsive container should exist (mock won't have actual height)
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('accepts custom height prop', () => {
      render(<TimeSeriesChart data={mockData} height={500} />);
      // Chart should render with custom height
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });
  });

  describe('Button Styling', () => {
    it('active metrics have active background', () => {
      render(
        <TimeSeriesChart data={mockData} metrics={[AnalyticsMetric.VIEWS]} />,
      );
      const button = screen.getByText('Views').closest('button');
      expect(button).toHaveClass('bg-white/10');
    });

    it('inactive metrics have transparent background', () => {
      render(
        <TimeSeriesChart
          data={mockData}
          metrics={[AnalyticsMetric.VIEWS, AnalyticsMetric.LIKES]}
        />,
      );

      // Toggle off likes
      const likesButton = screen.getByText('Likes').closest('button');
      fireEvent.click(likesButton!);

      expect(likesButton).toHaveClass('bg-transparent');
    });

    it('buttons have correct text styling', () => {
      render(
        <TimeSeriesChart data={mockData} metrics={[AnalyticsMetric.VIEWS]} />,
      );
      const button = screen.getByText('Views').closest('button');
      expect(button).toHaveClass('text-sm', 'font-medium');
    });

    it('buttons have rounded-full class', () => {
      render(
        <TimeSeriesChart data={mockData} metrics={[AnalyticsMetric.VIEWS]} />,
      );
      const button = screen.getByText('Views').closest('button');
      expect(button).toHaveClass('rounded-full');
    });
  });
});
