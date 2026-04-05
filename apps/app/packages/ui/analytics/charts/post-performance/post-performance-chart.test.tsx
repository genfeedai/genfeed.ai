import { PostPerformanceChart } from '@ui/analytics/charts/post-performance/post-performance-chart';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock recharts
vi.mock('recharts', () => ({
  Area: ({ dataKey, stroke }: { dataKey: string; stroke: string }) => (
    <div data-testid={`area-${dataKey}`} data-stroke={stroke} />
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

// Create hourly data (24 or fewer data points)
const mockHourlyData = Array.from({ length: 24 }, (_, i) => ({
  engagement: 50 + Math.floor(Math.random() * 100),
  timestamp: new Date(2024, 0, 1, i).toISOString(),
  views: 1000 + Math.floor(Math.random() * 500),
}));

// Create daily data (more than 24 data points)
const mockDailyData = Array.from({ length: 30 }, (_, i) => ({
  engagement: 200 + Math.floor(Math.random() * 300),
  timestamp: new Date(2024, 0, i + 1).toISOString(),
  views: 5000 + Math.floor(Math.random() * 2000),
}));

describe('PostPerformanceChart', () => {
  describe('Basic Rendering', () => {
    it('renders the chart container', () => {
      const { container } = render(
        <PostPerformanceChart data={mockHourlyData} />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders the responsive container', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('renders the area chart', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <PostPerformanceChart data={mockHourlyData} className="custom-class" />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      const { container } = render(
        <PostPerformanceChart data={mockHourlyData} isLoading />,
      );
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('disables metric buttons when loading', () => {
      render(<PostPerformanceChart data={mockHourlyData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty message when data is empty array', () => {
      render(<PostPerformanceChart data={[]} />);
      expect(
        screen.getByText('No performance data available'),
      ).toBeInTheDocument();
    });

    it('disables metric buttons when empty', () => {
      render(<PostPerformanceChart data={[]} />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it('does not show empty message when loading', () => {
      render(<PostPerformanceChart data={[]} isLoading />);
      expect(
        screen.queryByText('No performance data available'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Metric Toggle Buttons', () => {
    it('renders views and engagement buttons', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      expect(screen.getByText('views')).toBeInTheDocument();
      expect(screen.getByText('engagement')).toBeInTheDocument();
    });

    it('both metrics are active by default', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      const viewsButton = screen.getByText('views').closest('button');
      const engagementButton = screen.getByText('engagement').closest('button');
      expect(viewsButton).toHaveClass('bg-white/10');
      expect(engagementButton).toHaveClass('bg-white/10');
    });

    it('renders color indicator for each metric', () => {
      const { container } = render(
        <PostPerformanceChart data={mockHourlyData} />,
      );
      // Both buttons have rounded-full class, plus each has a color indicator span with rounded-full
      // So there are 4 elements total: 2 buttons + 2 color indicator spans
      const roundedElements = container.querySelectorAll('.rounded-full');
      expect(roundedElements.length).toBe(4);
    });
  });

  describe('Metric Toggle Behavior', () => {
    it('can toggle off views metric', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);

      const viewsButton = screen.getByText('views').closest('button');
      fireEvent.click(viewsButton!);

      expect(viewsButton).toHaveClass('bg-transparent');
    });

    it('cannot toggle off both metrics', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);

      // Toggle off views
      const viewsButton = screen.getByText('views').closest('button');
      fireEvent.click(viewsButton!);

      // Try to toggle off engagement (should fail since it's the only one left)
      const engagementButton = screen.getByText('engagement').closest('button');
      fireEvent.click(engagementButton!);

      // Engagement should still be active
      expect(engagementButton).toHaveClass('bg-white/10');
    });

    it('can toggle a metric back on', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);

      const viewsButton = screen.getByText('views').closest('button');

      // Toggle off
      fireEvent.click(viewsButton!);
      expect(viewsButton).toHaveClass('bg-transparent');

      // Toggle back on
      fireEvent.click(viewsButton!);
      expect(viewsButton).toHaveClass('bg-white/10');
    });
  });

  describe('Area Rendering', () => {
    it('renders views area by default', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      expect(screen.getByTestId('area-views')).toBeInTheDocument();
    });

    it('renders engagement area by default', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      expect(screen.getByTestId('area-engagement')).toBeInTheDocument();
    });

    it('removes views area when views is toggled off', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);

      fireEvent.click(screen.getByText('views').closest('button')!);

      expect(screen.queryByTestId('area-views')).not.toBeInTheDocument();
    });

    it('removes engagement area when engagement is toggled off', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);

      fireEvent.click(screen.getByText('engagement').closest('button')!);

      expect(screen.queryByTestId('area-engagement')).not.toBeInTheDocument();
    });
  });

  describe('Metric Colors', () => {
    it('uses foreground color for views metric', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      const viewsArea = screen.getByTestId('area-views');
      expect(viewsArea).toHaveAttribute(
        'data-stroke',
        'hsl(var(--foreground))',
      );
    });

    it('uses accent-rose color for engagement metric', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      const engagementArea = screen.getByTestId('area-engagement');
      expect(engagementArea).toHaveAttribute(
        'data-stroke',
        'var(--accent-rose)',
      );
    });
  });

  describe('Data Type Detection', () => {
    it('detects hourly data for 24 or fewer data points', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      expect(screen.getByText('Hourly data (first 24h)')).toBeInTheDocument();
    });

    it('detects daily data for more than 24 data points', () => {
      render(<PostPerformanceChart data={mockDailyData} />);
      expect(screen.getByText('Daily data')).toBeInTheDocument();
    });
  });

  describe('Height Configuration', () => {
    it('uses default height of 300', () => {
      const { container } = render(
        <PostPerformanceChart data={mockHourlyData} />,
      );
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '300px' });
    });

    it('accepts custom height', () => {
      const { container } = render(
        <PostPerformanceChart data={mockHourlyData} height={400} />,
      );
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '400px' });
    });
  });

  describe('Chart Components', () => {
    it('renders cartesian grid', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    });

    it('renders x-axis', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    });

    it('renders y-axis', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      expect(screen.getByTestId('y-axis')).toBeInTheDocument();
    });

    it('renders tooltip', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    });
  });

  describe('Button Styling States', () => {
    it('applies active styling to selected metrics', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);
      const activeButton = screen.getByText('views').closest('button');
      expect(activeButton).toHaveClass('text-white');
    });

    it('applies inactive styling to deselected metrics', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);

      fireEvent.click(screen.getByText('views').closest('button')!);

      const inactiveButton = screen.getByText('views').closest('button');
      expect(inactiveButton).toHaveClass('text-white/50');
    });

    it('applies disabled styling when loading', () => {
      render(<PostPerformanceChart data={mockHourlyData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveClass('opacity-50');
      });
    });

    it('applies cursor-not-allowed when loading', () => {
      render(<PostPerformanceChart data={mockHourlyData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveClass('cursor-not-allowed');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles data with single point', () => {
      const singleData = [
        { engagement: 10, timestamp: '2024-01-01T00:00:00.000Z', views: 100 },
      ];
      render(<PostPerformanceChart data={singleData} />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('handles data with zero values', () => {
      const zeroData = [
        { engagement: 0, timestamp: '2024-01-01T00:00:00.000Z', views: 0 },
        { engagement: 0, timestamp: '2024-01-01T01:00:00.000Z', views: 0 },
      ];
      render(<PostPerformanceChart data={zeroData} />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('handles very large numbers', () => {
      const bigData = [
        {
          engagement: 500000,
          timestamp: '2024-01-01T00:00:00.000Z',
          views: 10000000,
        },
        {
          engagement: 750000,
          timestamp: '2024-01-01T01:00:00.000Z',
          views: 15000000,
        },
      ];
      render(<PostPerformanceChart data={bigData} />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });
  });
});
