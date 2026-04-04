import { PlatformTimeSeriesChart } from '@ui/analytics/charts/platform-time-series/platform-time-series-chart';
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

const mockData = [
  {
    date: '2024-01-01',
    instagram: 5000,
    tiktok: 3000,
    twitter: 1500,
    youtube: 2000,
  },
  {
    date: '2024-01-02',
    instagram: 5500,
    tiktok: 3200,
    twitter: 1600,
    youtube: 2100,
  },
  {
    date: '2024-01-03',
    instagram: 6000,
    tiktok: 3500,
    twitter: 1700,
    youtube: 2200,
  },
];

const getPlatformButton = (label: string): HTMLButtonElement => {
  const button = screen.getByText(label).closest('button');
  if (!button) {
    throw new Error(`Expected ${label} button`);
  }
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected ${label} button element`);
  }
  return button;
};

describe('PlatformTimeSeriesChart', () => {
  describe('Basic Rendering', () => {
    it('renders the chart container', () => {
      const { container } = render(<PlatformTimeSeriesChart data={mockData} />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders the responsive container', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('renders the area chart', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <PlatformTimeSeriesChart data={mockData} className="custom-class" />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      const { container } = render(
        <PlatformTimeSeriesChart data={mockData} isLoading />,
      );
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('disables platform buttons when loading', () => {
      render(<PlatformTimeSeriesChart data={mockData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty message when data is empty array', () => {
      render(<PlatformTimeSeriesChart data={[]} />);
      expect(screen.getByText('No data available')).toBeInTheDocument();
    });

    it('shows empty message when data is undefined', () => {
      render(<PlatformTimeSeriesChart data={undefined as any} />);
      expect(screen.getByText('No data available')).toBeInTheDocument();
    });

    it('disables platform buttons when empty', () => {
      render(<PlatformTimeSeriesChart data={[]} />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it('does not show empty message when loading', () => {
      render(<PlatformTimeSeriesChart data={[]} isLoading />);
      expect(screen.queryByText('No data available')).not.toBeInTheDocument();
    });

    it('does not render chart when empty', () => {
      render(<PlatformTimeSeriesChart data={[]} />);
      expect(
        screen.queryByTestId('responsive-container'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Platform Toggle Buttons', () => {
    it('renders default platform buttons', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);
      expect(screen.getByText('Instagram')).toBeInTheDocument();
      expect(screen.getByText('TikTok')).toBeInTheDocument();
      expect(screen.getByText('YouTube')).toBeInTheDocument();
      expect(screen.getByText('Twitter')).toBeInTheDocument();
    });

    it('all default platforms are active initially', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);
      const instagramButton = screen.getByText('Instagram').closest('button');
      const tiktokButton = screen.getByText('TikTok').closest('button');
      const youtubeButton = screen.getByText('YouTube').closest('button');
      const twitterButton = screen.getByText('Twitter').closest('button');

      expect(instagramButton).toHaveClass('bg-white/10');
      expect(tiktokButton).toHaveClass('bg-white/10');
      expect(youtubeButton).toHaveClass('bg-white/10');
      expect(twitterButton).toHaveClass('bg-white/10');
    });

    it('accepts custom platforms prop', () => {
      render(
        <PlatformTimeSeriesChart
          data={mockData}
          platforms={['facebook', 'linkedin']}
        />,
      );
      expect(screen.getByText('Facebook')).toBeInTheDocument();
      expect(screen.getByText('LinkedIn')).toBeInTheDocument();
      expect(screen.queryByText('Instagram')).not.toBeInTheDocument();
    });

    it('renders color indicator for each platform', () => {
      const { container } = render(<PlatformTimeSeriesChart data={mockData} />);
      // Color indicators are small circles (w-3 h-3) inside buttons, one per platform
      const colorIndicators = container.querySelectorAll(
        '.w-3.h-3.rounded-full',
      );
      expect(colorIndicators.length).toBe(4);
    });
  });

  describe('Platform Toggle Behavior', () => {
    it('can toggle off a platform', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);

      const instagramButton = getPlatformButton('Instagram');
      fireEvent.click(instagramButton);

      expect(instagramButton).toHaveClass('bg-transparent');
    });

    it('cannot toggle off last remaining platform', () => {
      render(
        <PlatformTimeSeriesChart
          data={mockData}
          platforms={['instagram', 'tiktok']}
        />,
      );

      // Toggle off instagram
      fireEvent.click(getPlatformButton('Instagram'));

      // Try to toggle off tiktok (should fail)
      const tiktokButton = getPlatformButton('TikTok');
      fireEvent.click(tiktokButton);

      expect(tiktokButton).toHaveClass('bg-white/10');
    });

    it('can toggle a platform back on', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);

      const instagramButton = getPlatformButton('Instagram');

      // Toggle off
      fireEvent.click(instagramButton);
      expect(instagramButton).toHaveClass('bg-transparent');

      // Toggle back on
      fireEvent.click(instagramButton);
      expect(instagramButton).toHaveClass('bg-white/10');
    });
  });

  describe('Area Rendering', () => {
    it('renders area for all default platforms', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);
      expect(screen.getByTestId('area-instagram')).toBeInTheDocument();
      expect(screen.getByTestId('area-tiktok')).toBeInTheDocument();
      expect(screen.getByTestId('area-youtube')).toBeInTheDocument();
      expect(screen.getByTestId('area-twitter')).toBeInTheDocument();
    });

    it('removes area when platform is toggled off', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);

      fireEvent.click(getPlatformButton('Instagram'));

      expect(screen.queryByTestId('area-instagram')).not.toBeInTheDocument();
    });

    it('only renders areas for specified platforms', () => {
      render(
        <PlatformTimeSeriesChart
          data={mockData}
          platforms={['instagram', 'youtube']}
        />,
      );

      expect(screen.getByTestId('area-instagram')).toBeInTheDocument();
      expect(screen.getByTestId('area-youtube')).toBeInTheDocument();
      expect(screen.queryByTestId('area-tiktok')).not.toBeInTheDocument();
      expect(screen.queryByTestId('area-twitter')).not.toBeInTheDocument();
    });
  });

  describe('Platform Colors', () => {
    it('uses Instagram CSS variable color', () => {
      render(
        <PlatformTimeSeriesChart data={mockData} platforms={['instagram']} />,
      );
      const area = screen.getByTestId('area-instagram');
      expect(area).toHaveAttribute('data-stroke', 'var(--platform-instagram)');
    });

    it('uses TikTok CSS variable color', () => {
      render(
        <PlatformTimeSeriesChart data={mockData} platforms={['tiktok']} />,
      );
      const area = screen.getByTestId('area-tiktok');
      expect(area).toHaveAttribute('data-stroke', 'var(--platform-tiktok)');
    });

    it('uses YouTube destructive color', () => {
      render(
        <PlatformTimeSeriesChart data={mockData} platforms={['youtube']} />,
      );
      const area = screen.getByTestId('area-youtube');
      expect(area).toHaveAttribute('data-stroke', 'hsl(var(--destructive))');
    });

    it('uses Facebook CSS variable color', () => {
      render(
        <PlatformTimeSeriesChart data={mockData} platforms={['facebook']} />,
      );
      const area = screen.getByTestId('area-facebook');
      expect(area).toHaveAttribute('data-stroke', 'var(--platform-facebook)');
    });

    it('uses Twitter CSS variable color', () => {
      render(
        <PlatformTimeSeriesChart data={mockData} platforms={['twitter']} />,
      );
      const area = screen.getByTestId('area-twitter');
      expect(area).toHaveAttribute('data-stroke', 'var(--platform-twitter)');
    });
  });

  describe('Height Configuration', () => {
    it('uses default height of 300', () => {
      const { container } = render(<PlatformTimeSeriesChart data={mockData} />);
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '300px' });
    });

    it('accepts custom height', () => {
      const { container } = render(
        <PlatformTimeSeriesChart data={mockData} height={450} />,
      );
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '450px' });
    });
  });

  describe('Chart Components', () => {
    it('renders cartesian grid', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);
      expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    });

    it('renders x-axis', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);
      expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    });

    it('renders y-axis', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);
      expect(screen.getByTestId('y-axis')).toBeInTheDocument();
    });

    it('renders tooltip', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);
      expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    });
  });

  describe('Button Styling States', () => {
    it('applies active styling to selected platforms', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);
      const activeButton = screen.getByText('Instagram').closest('button');
      expect(activeButton).toHaveClass('text-white');
    });

    it('applies inactive styling to deselected platforms', () => {
      render(<PlatformTimeSeriesChart data={mockData} />);

      fireEvent.click(getPlatformButton('Instagram'));

      const inactiveButton = screen.getByText('Instagram').closest('button');
      expect(inactiveButton).toHaveClass('text-white/50');
    });

    it('applies disabled styling when loading', () => {
      render(<PlatformTimeSeriesChart data={mockData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveClass('opacity-50');
      });
    });

    it('applies cursor-not-allowed when loading', () => {
      render(<PlatformTimeSeriesChart data={mockData} isLoading />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveClass('cursor-not-allowed');
      });
    });
  });

  describe('All Platforms', () => {
    const allPlatforms = [
      {
        color: 'var(--platform-instagram)',
        label: 'Instagram',
        platform: 'instagram',
      },
      { color: 'var(--platform-tiktok)', label: 'TikTok', platform: 'tiktok' },
      {
        color: 'hsl(var(--destructive))',
        label: 'YouTube',
        platform: 'youtube',
      },
      {
        color: 'var(--platform-facebook)',
        label: 'Facebook',
        platform: 'facebook',
      },
      {
        color: 'var(--platform-twitter)',
        label: 'Twitter',
        platform: 'twitter',
      },
      {
        color: 'var(--platform-linkedin)',
        label: 'LinkedIn',
        platform: 'linkedin',
      },
      { color: 'var(--platform-reddit)', label: 'Reddit', platform: 'reddit' },
      {
        color: 'var(--platform-pinterest)',
        label: 'Pinterest',
        platform: 'pinterest',
      },
      { color: 'hsl(var(--foreground))', label: 'Medium', platform: 'medium' },
    ];

    it.each(allPlatforms)('renders $label button with correct color', ({
      platform,
      label,
      color,
    }) => {
      render(
        <PlatformTimeSeriesChart
          data={mockData}
          platforms={[platform as any]}
        />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      const area = screen.getByTestId(`area-${platform}`);
      expect(area).toHaveAttribute('data-stroke', color);
    });
  });

  describe('Edge Cases', () => {
    it('handles single data point', () => {
      const singleData = [
        {
          date: '2024-01-01',
          instagram: 5000,
          tiktok: 3000,
          twitter: 1500,
          youtube: 2000,
        },
      ];
      render(<PlatformTimeSeriesChart data={singleData} />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('handles data with zero values', () => {
      const zeroData = [
        { date: '2024-01-01', instagram: 0, tiktok: 0, twitter: 0, youtube: 0 },
        { date: '2024-01-02', instagram: 0, tiktok: 0, twitter: 0, youtube: 0 },
      ];
      render(<PlatformTimeSeriesChart data={zeroData} />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('handles very large numbers', () => {
      const bigData = [
        {
          date: '2024-01-01',
          instagram: 10000000,
          tiktok: 5000000,
          twitter: 2000000,
          youtube: 3000000,
        },
      ];
      render(<PlatformTimeSeriesChart data={bigData} />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('handles single platform', () => {
      render(
        <PlatformTimeSeriesChart data={mockData} platforms={['instagram']} />,
      );
      expect(screen.getByTestId('area-instagram')).toBeInTheDocument();
      expect(screen.getAllByRole('button').length).toBe(1);
    });
  });
});
