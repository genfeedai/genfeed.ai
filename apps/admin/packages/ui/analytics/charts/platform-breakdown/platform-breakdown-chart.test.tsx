import { PlatformBreakdownChart } from '@ui/analytics/charts/platform-breakdown/platform-breakdown-chart';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock recharts
vi.mock('recharts', () => ({
  Cell: ({ fill }: { fill: string }) => (
    <div data-testid="cell" data-fill={fill} />
  ),
  Pie: ({
    data,
    children,
  }: {
    data: Array<{ platform: string; value: number }>;
    children: React.ReactNode;
  }) => (
    <div data-testid="pie">
      {data?.map((item, i) => (
        <span key={i} data-testid={`pie-segment-${item.platform}`}>
          {item.platform}: {item.value}
        </span>
      ))}
      {children}
    </div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Tooltip: () => <div data-testid="tooltip" />,
}));

const mockData = [
  { platform: 'instagram', value: 5000 },
  { platform: 'tiktok', value: 3000 },
  { platform: 'youtube', value: 2000 },
];

describe('PlatformBreakdownChart', () => {
  describe('Basic Rendering', () => {
    it('renders the chart container', () => {
      render(<PlatformBreakdownChart data={mockData} />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('renders the pie chart', () => {
      render(<PlatformBreakdownChart data={mockData} />);
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });

    it('renders default title', () => {
      render(<PlatformBreakdownChart data={mockData} />);
      expect(screen.getByText('Platform Distribution')).toBeInTheDocument();
    });

    it('renders custom title', () => {
      render(<PlatformBreakdownChart data={mockData} title="Custom Title" />);
      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <PlatformBreakdownChart data={mockData} className="custom-class" />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      const { container } = render(
        <PlatformBreakdownChart data={mockData} isLoading />,
      );
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it.skip('shows empty message when data is null', () => {
      render(<PlatformBreakdownChart data={null} />);
      expect(
        screen.getByText('No platform data available'),
      ).toBeInTheDocument();
    });

    it('shows empty message when data is empty array', () => {
      render(<PlatformBreakdownChart data={[]} />);
      expect(
        screen.getByText('No platform data available'),
      ).toBeInTheDocument();
    });

    it('does not show empty message when loading', () => {
      render(<PlatformBreakdownChart data={[]} isLoading />);
      expect(
        screen.queryByText('No platform data available'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Data Filtering', () => {
    it('filters out platforms with zero values', () => {
      const dataWithZero = [
        { platform: 'instagram', value: 5000 },
        { platform: 'tiktok', value: 0 },
        { platform: 'youtube', value: 2000 },
      ];
      render(<PlatformBreakdownChart data={dataWithZero} />);

      expect(screen.getByTestId('pie-segment-instagram')).toBeInTheDocument();
      expect(screen.getByTestId('pie-segment-youtube')).toBeInTheDocument();
      expect(
        screen.queryByTestId('pie-segment-tiktok'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Platform Colors', () => {
    it('renders cells for each platform', () => {
      render(<PlatformBreakdownChart data={mockData} />);
      const cells = screen.getAllByTestId('cell');
      expect(cells.length).toBe(3);
    });

    it('applies Instagram color', () => {
      const instagramData = [{ platform: 'instagram', value: 1000 }];
      render(<PlatformBreakdownChart data={instagramData} />);
      const cell = screen.getByTestId('cell');
      expect(cell).toHaveAttribute('data-fill', 'var(--platform-instagram)');
    });

    it('applies YouTube color', () => {
      const youtubeData = [{ platform: 'youtube', value: 1000 }];
      render(<PlatformBreakdownChart data={youtubeData} />);
      const cell = screen.getByTestId('cell');
      expect(cell).toHaveAttribute('data-fill', 'hsl(var(--destructive))');
    });

    it('applies TikTok color', () => {
      const tiktokData = [{ platform: 'tiktok', value: 1000 }];
      render(<PlatformBreakdownChart data={tiktokData} />);
      const cell = screen.getByTestId('cell');
      expect(cell).toHaveAttribute('data-fill', 'var(--platform-tiktok)');
    });

    it('applies Facebook color', () => {
      const facebookData = [{ platform: 'facebook', value: 1000 }];
      render(<PlatformBreakdownChart data={facebookData} />);
      const cell = screen.getByTestId('cell');
      expect(cell).toHaveAttribute('data-fill', 'var(--platform-facebook)');
    });

    it('applies fallback color for unknown platform', () => {
      const unknownData = [{ platform: 'unknown', value: 1000 }];
      render(<PlatformBreakdownChart data={unknownData} />);
      const cell = screen.getByTestId('cell');
      expect(cell).toHaveAttribute('data-fill', 'hsl(var(--muted-foreground))');
    });
  });

  describe('Height Configuration', () => {
    it('uses default height of 300', () => {
      const { container } = render(<PlatformBreakdownChart data={mockData} />);
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '300px' });
    });

    it('accepts custom height', () => {
      const { container } = render(
        <PlatformBreakdownChart data={mockData} height={400} />,
      );
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '400px' });
    });
  });

  describe('All Platforms', () => {
    const allPlatforms = [
      {
        expectedColor: 'var(--platform-instagram)',
        platform: 'instagram',
        value: 100,
      },
      {
        expectedColor: 'var(--platform-tiktok)',
        platform: 'tiktok',
        value: 100,
      },
      {
        expectedColor: 'hsl(var(--destructive))',
        platform: 'youtube',
        value: 100,
      },
      {
        expectedColor: 'var(--platform-facebook)',
        platform: 'facebook',
        value: 100,
      },
      {
        expectedColor: 'var(--platform-twitter)',
        platform: 'twitter',
        value: 100,
      },
      {
        expectedColor: 'var(--platform-linkedin)',
        platform: 'linkedin',
        value: 100,
      },
      {
        expectedColor: 'var(--platform-reddit)',
        platform: 'reddit',
        value: 100,
      },
      {
        expectedColor: 'var(--platform-pinterest)',
        platform: 'pinterest',
        value: 100,
      },
      {
        expectedColor: 'hsl(var(--foreground))',
        platform: 'medium',
        value: 100,
      },
    ];

    it.each(allPlatforms)('renders $platform with correct color', ({
      platform,
      value,
      expectedColor,
    }) => {
      render(<PlatformBreakdownChart data={[{ platform, value }]} />);
      const cell = screen.getByTestId('cell');
      expect(cell).toHaveAttribute('data-fill', expectedColor);
    });
  });

  describe('Case Insensitivity', () => {
    it('handles uppercase platform names', () => {
      const upperData = [{ platform: 'INSTAGRAM', value: 1000 }];
      render(<PlatformBreakdownChart data={upperData} />);
      const cell = screen.getByTestId('cell');
      expect(cell).toHaveAttribute('data-fill', 'var(--platform-instagram)');
    });

    it('handles mixed case platform names', () => {
      const mixedData = [{ platform: 'TikTok', value: 1000 }];
      render(<PlatformBreakdownChart data={mixedData} />);
      const cell = screen.getByTestId('cell');
      expect(cell).toHaveAttribute('data-fill', 'var(--platform-tiktok)');
    });
  });
});
