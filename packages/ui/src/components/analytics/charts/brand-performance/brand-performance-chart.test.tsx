import { BrandPerformanceChart } from '@ui/analytics/charts/brand-performance/brand-performance-chart';
import '@testing-library/jest-dom/vitest';
import { AnalyticsMetric } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/charts', () => ({
  ChartContainer: ({
    children,
    className,
    height,
    style,
  }: {
    children: ReactNode;
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

const rechartsMocks = vi.hoisted(() => ({
  Bar: ({ dataKey, fill }: { dataKey: string; fill: string }) => (
    <div data-testid="bar" data-key={dataKey} data-fill={fill} />
  ),
  BarChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
}));

vi.mock('recharts', () => rechartsMocks);

// Chart uses `dynamic(() => import('recharts').then((m) => m.BarChart), …)`.
// Resolve those loaders from the recharts mock so tests stay synchronous.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    const source = String(loader);
    const propertyAccesses = [...source.matchAll(/\.([A-Za-z]+)/g)].map(
      (entry) => entry[1],
    );
    // Prefer the last recharts export name (BarChart, Bar, XAxis, …).
    const exportName = [...propertyAccesses]
      .reverse()
      .find((name) => name in rechartsMocks);
    const Comp =
      exportName && exportName in rechartsMocks
        ? rechartsMocks[exportName as keyof typeof rechartsMocks]
        : () => null;
    return function DynamicChartPiece(props: Record<string, unknown>) {
      return <Comp {...props} />;
    };
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
    label,
  }: {
    children: ReactNode;
    className?: string;
    label?: string;
  }) => (
    <div data-testid="card" className={className}>
      {label ? <h3>{label}</h3> : null}
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
      expect(screen.getByText('No brand performance yet')).toBeInTheDocument();
    });

    it('hides metric buttons when empty (no signal)', () => {
      render(<BrandPerformanceChart data={[]} />);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('does not show empty message when loading', () => {
      render(<BrandPerformanceChart data={[]} isLoading />);
      expect(
        screen.queryByText('No brand performance yet'),
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
      expect(engagementButton).toHaveClass('bg-muted');
    });

    it('accepts custom initial metric', () => {
      render(
        <BrandPerformanceChart
          data={mockData}
          metric={AnalyticsMetric.VIEWS}
        />,
      );
      const viewsButton = screen.getByText('Views').closest('button');
      expect(viewsButton).toHaveClass('bg-muted');
    });

    it('changes active metric on button click', () => {
      render(<BrandPerformanceChart data={mockData} />);

      const viewsButton = screen.getByText('Views').closest('button');
      if (viewsButton) {
        fireEvent.click(viewsButton);
      }

      expect(viewsButton).toHaveClass('bg-muted');
    });

    it('renders color indicator for each metric', () => {
      const { container } = render(<BrandPerformanceChart data={mockData} />);
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
      expect(screen.getByTestId('bar')).toHaveAttribute(
        'data-fill',
        'hsl(var(--foreground))',
      );
    });

    it('uses accent-rose color for engagement metric', () => {
      render(
        <BrandPerformanceChart
          data={mockData}
          metric={AnalyticsMetric.ENGAGEMENT}
        />,
      );
      expect(screen.getByTestId('bar')).toHaveAttribute(
        'data-fill',
        'var(--accent-rose)',
      );
    });

    it('uses overlay-white color for posts metric', () => {
      render(
        <BrandPerformanceChart
          data={mockData}
          metric={AnalyticsMetric.POSTS}
        />,
      );
      expect(screen.getByTestId('bar')).toHaveAttribute(
        'data-fill',
        'var(--overlay-white-20)',
      );
    });
  });

  describe('Data Key Changes', () => {
    it('uses engagement as default dataKey', () => {
      render(<BrandPerformanceChart data={mockData} />);
      expect(screen.getByTestId('bar')).toHaveAttribute(
        'data-key',
        'engagement',
      );
    });

    it('updates dataKey when metric changes', () => {
      render(<BrandPerformanceChart data={mockData} />);
      const viewsButton = screen.getByText('Views').closest('button');
      if (viewsButton) {
        fireEvent.click(viewsButton);
      }
      expect(screen.getByTestId('bar')).toHaveAttribute('data-key', 'views');
    });

    it('switches to posts dataKey', () => {
      render(<BrandPerformanceChart data={mockData} />);
      const postsButton = screen.getByText('Posts').closest('button');
      if (postsButton) {
        fireEvent.click(postsButton);
      }
      expect(screen.getByTestId('bar')).toHaveAttribute('data-key', 'posts');
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

  describe('Edge Cases', () => {
    it('handles data with zero values as empty', () => {
      const zeroData = [{ engagement: 0, name: 'Brand A', posts: 0, views: 0 }];
      render(<BrandPerformanceChart data={zeroData} />);
      expect(screen.getByText('No brand performance yet')).toBeInTheDocument();
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
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
