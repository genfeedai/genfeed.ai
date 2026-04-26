import { BrandPerformanceChart } from '@ui/analytics/charts/brand-performance/brand-performance-chart';
import '@testing-library/jest-dom';
import { AnalyticsMetric } from '@genfeedai/enums';
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
  Bar: ({ dataKey, fill }: { dataKey: string; fill: string }) => (
    <div data-testid="bar" data-key={dataKey} data-fill={fill} />
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
}));

// Mock Card component
vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

const mockData = [
  { engagement: 2500, name: 'Brand A', posts: 120, views: 50000 },
  { engagement: 3200, name: 'Brand B', posts: 85, views: 35000 },
  { engagement: 1800, name: 'Brand C', posts: 95, views: 42000 },
];

const mockDataLarge = [
  { engagement: 2500, name: 'Brand A', posts: 120, views: 50000 },
  { engagement: 3200, name: 'Brand B', posts: 85, views: 35000 },
  { engagement: 1800, name: 'Brand C', posts: 95, views: 42000 },
  { engagement: 1500, name: 'Brand D', posts: 65, views: 28000 },
  { engagement: 4000, name: 'Brand E', posts: 150, views: 55000 },
  { engagement: 900, name: 'Brand F', posts: 40, views: 18000 },
  { engagement: 3500, name: 'Brand G', posts: 180, views: 62000 },
  { engagement: 1200, name: 'Brand H', posts: 70, views: 31000 },
  { engagement: 2800, name: 'Brand I', posts: 110, views: 45000 },
  { engagement: 2100, name: 'Brand J', posts: 100, views: 38000 },
  { engagement: 1100, name: 'Brand K', posts: 55, views: 22000 },
  { engagement: 800, name: 'Brand L', posts: 35, views: 15000 },
];

describe('BrandPerformanceChart', () => {
  describe('Basic Rendering', () => {
    it('renders the chart in a card', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });

    it('renders the responsive container', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('renders the bar chart', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('renders default title', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByText('Top Brands Performance')).toBeInTheDocument();
    });

    it('renders custom title', () => {
      render(<BrandPerformanceChart data={mockData} title="Custom Title" />);
      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <BrandPerformanceChart data={mockData} className="custom-class" />,
      );
      expect(screen.getByTestId('card')).toHaveClass('custom-class');
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      const { container } = render(
        <BrandPerformanceChart data={mockData} isLoading />,
      );
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('disables metric buttons when loading', () => {
      render(<BrandPerformanceChart data={mockData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty message when data is empty array', () => {
      render(<BrandPerformanceChart data={[]} />);
      expect(
        screen.getByText('No data available for the selected period'),
      ).toBeInTheDocument();
    });

    it('disables metric buttons when empty', () => {
      render(<BrandPerformanceChart data={[]} />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it('does not show empty message when loading', () => {
      render(<BrandPerformanceChart data={[]} isLoading />);
      expect(
        screen.queryByText('No data available for the selected period'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Metric Toggle Buttons', () => {
    it('renders all three metric buttons', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByText('Views')).toBeInTheDocument();
      expect(screen.getByText('Engagement')).toBeInTheDocument();
      expect(screen.getByText('Posts')).toBeInTheDocument();
    });

    it('defaults to engagement metric', () => {
      render(<BrandPerformanceChart data={mockData} />);
      const engagementButton = screen.getByText('Engagement').closest('button');
      expect(engagementButton).toHaveClass('bg-white/10');
    });

    it('accepts custom initial metric', () => {
      render(
        <BrandPerformanceChart
          data={mockData}
          metric={AnalyticsMetric.VIEWS}
        />,
      );
      const viewsButton = screen.getByText('Views').closest('button');
      expect(viewsButton).toHaveClass('bg-white/10');
    });

    it('changes active metric on button click', () => {
      render(<BrandPerformanceChart data={mockData} />);

      const viewsButton = screen.getByText('Views').closest('button');
      fireEvent.click(viewsButton!);

      expect(viewsButton).toHaveClass('bg-white/10');
    });

    it('renders color indicator for each metric', () => {
      const { container } = render(<BrandPerformanceChart data={mockData} />);
      // 3 buttons with rounded-full class + 3 color indicator spans with rounded-full
      const roundedElements = container.querySelectorAll('.rounded-full');
      expect(roundedElements.length).toBe(6);
    });
  });

  describe('Metric Colors', () => {
    it('uses foreground color for views metric', () => {
      render(
        <BrandPerformanceChart
          data={mockData}
          metric={AnalyticsMetric.VIEWS}
        />,
      );
      const bar = screen.getByTestId('bar');
      expect(bar).toHaveAttribute('data-fill', 'hsl(var(--foreground))');
    });

    it('uses accent-rose color for engagement metric', () => {
      render(
        <BrandPerformanceChart
          data={mockData}
          metric={AnalyticsMetric.ENGAGEMENT}
        />,
      );
      const bar = screen.getByTestId('bar');
      expect(bar).toHaveAttribute('data-fill', 'var(--accent-rose)');
    });

    it('uses overlay-white color for posts metric', () => {
      render(
        <BrandPerformanceChart
          data={mockData}
          metric={AnalyticsMetric.POSTS}
        />,
      );
      const bar = screen.getByTestId('bar');
      expect(bar).toHaveAttribute('data-fill', 'var(--overlay-white-20)');
    });
  });

  describe('Data Key Changes', () => {
    it('uses engagement as default dataKey', () => {
      render(<BrandPerformanceChart data={mockData} />);
      const bar = screen.getByTestId('bar');
      expect(bar).toHaveAttribute('data-key', 'engagement');
    });

    it('updates dataKey when metric changes', () => {
      render(<BrandPerformanceChart data={mockData} />);

      fireEvent.click(screen.getByText('Views').closest('button')!);

      const bar = screen.getByTestId('bar');
      expect(bar).toHaveAttribute('data-key', 'views');
    });

    it('switches to posts dataKey', () => {
      render(<BrandPerformanceChart data={mockData} />);

      fireEvent.click(screen.getByText('Posts').closest('button')!);

      const bar = screen.getByTestId('bar');
      expect(bar).toHaveAttribute('data-key', 'posts');
    });
  });

  describe('Height Configuration', () => {
    it('uses default height of 300', () => {
      const { container } = render(<BrandPerformanceChart data={mockData} />);
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '300px' });
    });

    it('accepts custom height', () => {
      const { container } = render(
        <BrandPerformanceChart data={mockData} height={450} />,
      );
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '450px' });
    });
  });

  describe('Data Sorting and Limiting', () => {
    it('renders chart with provided data', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('handles data with more than 10 brands', () => {
      render(<BrandPerformanceChart data={mockDataLarge} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });

  describe('Chart Components', () => {
    it('renders cartesian grid', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    });

    it('renders x-axis', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    });

    it('renders y-axis', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByTestId('y-axis')).toBeInTheDocument();
    });

    it('renders tooltip', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    });
  });

  describe('Button Styling States', () => {
    it('applies active styling to selected metric', () => {
      render(
        <BrandPerformanceChart
          data={mockData}
          metric={AnalyticsMetric.VIEWS}
        />,
      );
      const activeButton = screen.getByText('Views').closest('button');
      expect(activeButton).toHaveClass('text-white');
    });

    it('applies inactive styling to non-selected metrics', () => {
      render(
        <BrandPerformanceChart
          data={mockData}
          metric={AnalyticsMetric.VIEWS}
        />,
      );
      const inactiveButton = screen.getByText('Engagement').closest('button');
      expect(inactiveButton).toHaveClass('bg-transparent');
    });

    it('applies disabled styling when loading', () => {
      render(<BrandPerformanceChart data={mockData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveClass('opacity-50');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles data with zero values', () => {
      const zeroData = [{ engagement: 0, name: 'Brand A', posts: 0, views: 0 }];
      render(<BrandPerformanceChart data={zeroData} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('handles single brand data', () => {
      const singleData = [
        { engagement: 50, name: 'Single Brand', posts: 10, views: 1000 },
      ];
      render(<BrandPerformanceChart data={singleData} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('handles brands with long names', () => {
      const longNameData = [
        {
          engagement: 50,
          name: 'This Is A Very Long Brand Name That Exceeds Fifteen Characters',
          posts: 10,
          views: 1000,
        },
      ];
      render(<BrandPerformanceChart data={longNameData} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });
});
