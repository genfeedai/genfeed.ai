import { PlatformComparisonChart } from '@ui/analytics/charts/platform-comparison/platform-comparison-chart';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock recharts
vi.mock('recharts', () => ({
  Bar: ({ dataKey, fill }: { dataKey: string; fill: string }) => (
    <div data-testid={`bar-${dataKey}`} data-fill={fill} />
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
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
    comments: 500,
    likes: 2500,
    platform: 'instagram',
    shares: 200,
    views: 50000,
  },
  { comments: 800, likes: 3200, platform: 'tiktok', shares: 400, views: 35000 },
  {
    comments: 300,
    likes: 1800,
    platform: 'youtube',
    shares: 150,
    views: 42000,
  },
];

const getMetricButton = (label: string): HTMLButtonElement => {
  const button = screen.getByText(label).closest('button');
  if (!button) {
    throw new Error(`Expected ${label} button`);
  }
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected ${label} button element`);
  }
  return button;
};

describe('PlatformComparisonChart', () => {
  describe('Basic Rendering', () => {
    it('renders the chart container', () => {
      const { container } = render(<PlatformComparisonChart data={mockData} />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders the responsive container', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('renders the bar chart', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <PlatformComparisonChart data={mockData} className="custom-class" />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      const { container } = render(
        <PlatformComparisonChart data={mockData} isLoading />,
      );
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('disables metric buttons when loading', () => {
      render(<PlatformComparisonChart data={mockData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty message when data is empty array', () => {
      render(<PlatformComparisonChart data={[]} />);
      expect(
        screen.getByText('No platform data available'),
      ).toBeInTheDocument();
    });

    it('shows empty message when data is undefined', () => {
      render(<PlatformComparisonChart data={undefined as any} />);
      expect(
        screen.getByText('No platform data available'),
      ).toBeInTheDocument();
    });

    it('disables metric buttons when empty', () => {
      render(<PlatformComparisonChart data={[]} />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it('does not show empty message when loading', () => {
      render(<PlatformComparisonChart data={[]} isLoading />);
      expect(
        screen.queryByText('No platform data available'),
      ).not.toBeInTheDocument();
    });

    it('does not render chart when empty', () => {
      render(<PlatformComparisonChart data={[]} />);
      expect(
        screen.queryByTestId('responsive-container'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Metric Toggle Buttons', () => {
    it('renders all four metric buttons', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.getByText('views')).toBeInTheDocument();
      expect(screen.getByText('likes')).toBeInTheDocument();
      expect(screen.getByText('comments')).toBeInTheDocument();
      expect(screen.getByText('shares')).toBeInTheDocument();
    });

    it('defaults to views and likes active', () => {
      render(<PlatformComparisonChart data={mockData} />);
      const viewsButton = screen.getByText('views').closest('button');
      const likesButton = screen.getByText('likes').closest('button');
      expect(viewsButton).toHaveClass('bg-white/10');
      expect(likesButton).toHaveClass('bg-white/10');
    });

    it('comments and shares are inactive by default', () => {
      render(<PlatformComparisonChart data={mockData} />);
      const commentsButton = screen.getByText('comments').closest('button');
      const sharesButton = screen.getByText('shares').closest('button');
      expect(commentsButton).toHaveClass('bg-transparent');
      expect(sharesButton).toHaveClass('bg-transparent');
    });

    it('renders color indicator for each metric', () => {
      const { container } = render(<PlatformComparisonChart data={mockData} />);
      // Color indicators are small circles (w-3 h-3) inside buttons, one per metric
      const colorIndicators = container.querySelectorAll(
        '.w-3.h-3.rounded-full',
      );
      expect(colorIndicators.length).toBe(4);
    });
  });

  describe('Metric Toggle Behavior', () => {
    it('can toggle on comments metric', () => {
      render(<PlatformComparisonChart data={mockData} />);

      const commentsButton = getMetricButton('comments');
      fireEvent.click(commentsButton);

      expect(commentsButton).toHaveClass('bg-white/10');
    });

    it('can toggle off views metric', () => {
      render(<PlatformComparisonChart data={mockData} />);

      const viewsButton = getMetricButton('views');
      fireEvent.click(viewsButton);

      expect(viewsButton).toHaveClass('bg-transparent');
    });

    it('cannot toggle off last remaining metric', () => {
      render(<PlatformComparisonChart data={mockData} />);

      // Toggle off views
      fireEvent.click(getMetricButton('views'));

      // Try to toggle off likes (should fail - it's the last one)
      const likesButton = getMetricButton('likes');
      fireEvent.click(likesButton);

      expect(likesButton).toHaveClass('bg-white/10');
    });

    it('can toggle a metric back on', () => {
      render(<PlatformComparisonChart data={mockData} />);

      const viewsButton = getMetricButton('views');

      // Toggle off
      fireEvent.click(viewsButton);
      expect(viewsButton).toHaveClass('bg-transparent');

      // Toggle back on
      fireEvent.click(viewsButton);
      expect(viewsButton).toHaveClass('bg-white/10');
    });
  });

  describe('Bar Rendering', () => {
    it('renders views bar by default', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.getByTestId('bar-views')).toBeInTheDocument();
    });

    it('renders likes bar by default', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.getByTestId('bar-likes')).toBeInTheDocument();
    });

    it('does not render comments bar by default', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.queryByTestId('bar-comments')).not.toBeInTheDocument();
    });

    it('does not render shares bar by default', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.queryByTestId('bar-shares')).not.toBeInTheDocument();
    });

    it('renders comments bar when toggled on', () => {
      render(<PlatformComparisonChart data={mockData} />);

      fireEvent.click(getMetricButton('comments'));

      expect(screen.getByTestId('bar-comments')).toBeInTheDocument();
    });

    it('removes views bar when toggled off', () => {
      render(<PlatformComparisonChart data={mockData} />);

      fireEvent.click(getMetricButton('views'));

      expect(screen.queryByTestId('bar-views')).not.toBeInTheDocument();
    });
  });

  describe('Metric Colors', () => {
    it('uses foreground color for views', () => {
      render(<PlatformComparisonChart data={mockData} />);
      const viewsBar = screen.getByTestId('bar-views');
      expect(viewsBar).toHaveAttribute('data-fill', 'hsl(var(--foreground))');
    });

    it('uses accent-violet color for likes', () => {
      render(<PlatformComparisonChart data={mockData} />);
      const likesBar = screen.getByTestId('bar-likes');
      expect(likesBar).toHaveAttribute('data-fill', 'var(--accent-violet)');
    });

    it('uses overlay-white color for comments', () => {
      render(<PlatformComparisonChart data={mockData} />);

      fireEvent.click(getMetricButton('comments'));

      const commentsBar = screen.getByTestId('bar-comments');
      expect(commentsBar).toHaveAttribute(
        'data-fill',
        'var(--overlay-white-20)',
      );
    });

    it('uses accent-orange color for shares', () => {
      render(<PlatformComparisonChart data={mockData} />);

      fireEvent.click(getMetricButton('shares'));

      const sharesBar = screen.getByTestId('bar-shares');
      expect(sharesBar).toHaveAttribute('data-fill', 'var(--accent-orange)');
    });
  });

  describe('Height Configuration', () => {
    it('uses default height of 300', () => {
      const { container } = render(<PlatformComparisonChart data={mockData} />);
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '300px' });
    });

    it('accepts custom height', () => {
      const { container } = render(
        <PlatformComparisonChart data={mockData} height={450} />,
      );
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '450px' });
    });
  });

  describe('Chart Components', () => {
    it('renders cartesian grid', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    });

    it('renders x-axis', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    });

    it('renders y-axis', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.getByTestId('y-axis')).toBeInTheDocument();
    });

    it('renders tooltip', () => {
      render(<PlatformComparisonChart data={mockData} />);
      expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    });
  });

  describe('Button Styling States', () => {
    it('applies active styling to selected metrics', () => {
      render(<PlatformComparisonChart data={mockData} />);
      const activeButton = screen.getByText('views').closest('button');
      expect(activeButton).toHaveClass('text-white');
    });

    it('applies inactive styling to unselected metrics', () => {
      render(<PlatformComparisonChart data={mockData} />);
      const inactiveButton = screen.getByText('comments').closest('button');
      expect(inactiveButton).toHaveClass('text-white/50');
    });

    it('applies disabled styling when loading', () => {
      render(<PlatformComparisonChart data={mockData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveClass('opacity-50');
      });
    });

    it('applies cursor-not-allowed when loading', () => {
      render(<PlatformComparisonChart data={mockData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveClass('cursor-not-allowed');
      });
    });
  });

  describe('Multiple Active Metrics', () => {
    it('can have all four metrics active', () => {
      render(<PlatformComparisonChart data={mockData} />);

      fireEvent.click(getMetricButton('comments'));
      fireEvent.click(getMetricButton('shares'));

      expect(screen.getByTestId('bar-views')).toBeInTheDocument();
      expect(screen.getByTestId('bar-likes')).toBeInTheDocument();
      expect(screen.getByTestId('bar-comments')).toBeInTheDocument();
      expect(screen.getByTestId('bar-shares')).toBeInTheDocument();
    });

    it('can have exactly one metric active', () => {
      render(<PlatformComparisonChart data={mockData} />);

      fireEvent.click(getMetricButton('views'));

      expect(screen.queryByTestId('bar-views')).not.toBeInTheDocument();
      expect(screen.getByTestId('bar-likes')).toBeInTheDocument();
      expect(screen.queryByTestId('bar-comments')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bar-shares')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles single platform data', () => {
      const singleData = [
        {
          comments: 50,
          likes: 100,
          platform: 'instagram',
          shares: 20,
          views: 1000,
        },
      ];
      render(<PlatformComparisonChart data={singleData} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('handles data with zero values', () => {
      const zeroData = [
        { comments: 0, likes: 0, platform: 'instagram', shares: 0, views: 0 },
      ];
      render(<PlatformComparisonChart data={zeroData} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('handles many platforms', () => {
      const manyData = [
        {
          comments: 50,
          likes: 100,
          platform: 'instagram',
          shares: 20,
          views: 1000,
        },
        {
          comments: 100,
          likes: 200,
          platform: 'tiktok',
          shares: 40,
          views: 2000,
        },
        {
          comments: 150,
          likes: 300,
          platform: 'youtube',
          shares: 60,
          views: 3000,
        },
        {
          comments: 200,
          likes: 400,
          platform: 'facebook',
          shares: 80,
          views: 4000,
        },
        {
          comments: 250,
          likes: 500,
          platform: 'twitter',
          shares: 100,
          views: 5000,
        },
        {
          comments: 300,
          likes: 600,
          platform: 'linkedin',
          shares: 120,
          views: 6000,
        },
      ];
      render(<PlatformComparisonChart data={manyData} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });
});
