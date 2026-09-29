import { PostPerformanceChart } from '@ui/analytics/charts/post-performance/post-performance-chart';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  ChartTooltipContent: () => <div data-testid="chart-tooltip-content" />,
}));

// Mock recharts
vi.mock('recharts', () => ({
  Area: ({ dataKey, stroke }: { dataKey: string; stroke: string }) => (
    <div data-testid={`area-${dataKey}`} data-stroke={stroke} />
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
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

describe('PostPerformanceChart', () => {
  describe('Empty State', () => {
    it('disables metric buttons when empty', () => {
      render(<PostPerformanceChart data={[]} />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
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
      expect(viewsButton).toHaveClass('bg-muted');
      expect(engagementButton).toHaveClass('bg-muted');
    });
  });

  describe('Metric Toggle Behavior', () => {
    it('cannot toggle off both metrics', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);

      // Toggle off views
      const viewsButton = screen.getByText('views').closest('button');
      fireEvent.click(viewsButton!);

      // Try to toggle off engagement (should fail since it's the only one left)
      const engagementButton = screen.getByText('engagement').closest('button');
      fireEvent.click(engagementButton!);

      // Engagement should still be active
      expect(engagementButton).toHaveClass('bg-muted');
    });

    it('can toggle a metric back on', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);

      const viewsButton = screen.getByText('views').closest('button');

      // Toggle off
      fireEvent.click(viewsButton!);
      expect(viewsButton).toHaveClass('bg-transparent');

      // Toggle back on
      fireEvent.click(viewsButton!);
      expect(viewsButton).toHaveClass('bg-muted');
    });
  });

  describe('Area Rendering', () => {
    it('removes engagement area when engagement is toggled off', () => {
      render(<PostPerformanceChart data={mockHourlyData} />);

      fireEvent.click(screen.getByText('engagement').closest('button')!);

      expect(screen.queryByTestId('area-engagement')).not.toBeInTheDocument();
    });
  });

  describe('Button Styling States', () => {
    it('applies cursor-not-allowed when loading', () => {
      render(<PostPerformanceChart data={mockHourlyData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveClass('cursor-not-allowed');
      });
    });
  });
});
