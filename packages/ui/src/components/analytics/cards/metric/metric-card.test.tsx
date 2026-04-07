import { TrendDirection } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import { MetricCard } from '@ui/analytics/cards/metric/metric-card';
import { HiChartBar } from 'react-icons/hi2';
import { describe, expect, it, vi } from 'vitest';

describe('MetricCard', () => {
  describe('Basic Rendering', () => {
    it('renders title and value correctly', () => {
      render(<MetricCard title="Total Views" value={1000} />);
      expect(screen.getByText('Total Views')).toBeInTheDocument();
      expect(screen.getByText('1K')).toBeInTheDocument();
    });

    it('renders string value without formatting', () => {
      render(<MetricCard title="Status" value="Active" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders numeric value with compact notation', () => {
      render(<MetricCard title="Followers" value={1500000} />);
      expect(screen.getByText('1.5M')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <MetricCard title="Test" value={100} className="custom-class" />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Loading State', () => {
    it('shows loading skeleton when isLoading is true', () => {
      const { container } = render(
        <MetricCard title="Test" value={100} isLoading />,
      );
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('does not show value when loading', () => {
      render(<MetricCard title="Test" value={100} isLoading />);
      expect(screen.queryByText('100')).not.toBeInTheDocument();
    });

    it('applies click handler on loading state', () => {
      const handleClick = vi.fn();
      const { container } = render(
        <MetricCard title="Test" value={100} isLoading onClick={handleClick} />,
      );
      expect(container.firstChild).toHaveClass('cursor-pointer');
    });
  });

  describe('Icon Rendering', () => {
    it('renders icon when provided', () => {
      render(<MetricCard title="Test" value={100} icon={HiChartBar} />);
      const iconContainer = document.querySelector('.bg-muted');
      expect(iconContainer).toBeInTheDocument();
    });

    it('applies custom icon color', () => {
      render(
        <MetricCard
          title="Test"
          value={100}
          icon={HiChartBar}
          iconColor="text-blue-600"
        />,
      );
      const iconContainer = document.querySelector('.text-blue-600');
      expect(iconContainer).toBeInTheDocument();
    });

    it('uses default icon color when not specified', () => {
      render(<MetricCard title="Test" value={100} icon={HiChartBar} />);
      const iconContainer = document.querySelector('.text-purple-600');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe('Change Indicator', () => {
    it('shows positive change with plus sign', () => {
      render(<MetricCard title="Test" value={100} change={5.5} />);
      expect(screen.getByText('+5.5%')).toBeInTheDocument();
    });

    it('shows negative change without plus sign', () => {
      render(<MetricCard title="Test" value={100} change={-3.2} />);
      expect(screen.getByText('-3.2%')).toBeInTheDocument();
    });

    it('shows zero change with plus sign', () => {
      render(<MetricCard title="Test" value={100} change={0} />);
      expect(screen.getByText('+0.0%')).toBeInTheDocument();
    });

    it('applies green color for positive change', () => {
      const { container } = render(
        <MetricCard title="Test" value={100} change={5} />,
      );
      const changeElement = container.querySelector('.text-green-600');
      expect(changeElement).toBeInTheDocument();
    });

    it('applies red color for negative change', () => {
      const { container } = render(
        <MetricCard title="Test" value={100} change={-5} />,
      );
      const changeElement = container.querySelector('.text-red-600');
      expect(changeElement).toBeInTheDocument();
    });

    it('applies gray color for zero change', () => {
      const { container } = render(
        <MetricCard title="Test" value={100} change={0} />,
      );
      const changeElement = container.querySelector('.text-muted-foreground');
      expect(changeElement).toBeInTheDocument();
    });
  });

  describe('Trend Indicator', () => {
    it('shows up trend icon', () => {
      const { container } = render(
        <MetricCard
          title="Test"
          value={100}
          trend={TrendDirection.UP}
          change={5}
        />,
      );
      const trendContainer = container.querySelector('.text-green-600');
      expect(trendContainer).toBeInTheDocument();
      expect(trendContainer?.querySelector('svg')).toBeInTheDocument();
    });

    it('shows down trend icon', () => {
      const { container } = render(
        <MetricCard
          title="Test"
          value={100}
          trend={TrendDirection.DOWN}
          change={-5}
        />,
      );
      const trendContainer = container.querySelector('.text-red-600');
      expect(trendContainer).toBeInTheDocument();
      expect(trendContainer?.querySelector('svg')).toBeInTheDocument();
    });

    it('shows stable trend icon', () => {
      const { container } = render(
        <MetricCard
          title="Test"
          value={100}
          trend={TrendDirection.STABLE}
          change={0}
        />,
      );
      const trendContainer = container.querySelector('.text-muted-foreground');
      expect(trendContainer).toBeInTheDocument();
    });

    it('does not show trend icon when trend is not provided', () => {
      render(<MetricCard title="Test" value={100} />);
      const trendElement = screen.queryByRole('img');
      expect(trendElement).not.toBeInTheDocument();
    });
  });

  describe('Subtitle', () => {
    it('renders subtitle when provided', () => {
      render(<MetricCard title="Test" value={100} subtitle="vs last month" />);
      expect(screen.getByText('vs last month')).toBeInTheDocument();
    });

    it('does not render subtitle when not provided', () => {
      render(<MetricCard title="Test" value={100} />);
      expect(screen.queryByText('vs last month')).not.toBeInTheDocument();
    });
  });

  describe('Click Handling', () => {
    it('calls onClick when clicked', () => {
      const handleClick = vi.fn();
      render(<MetricCard title="Test" value={100} onClick={handleClick} />);
      fireEvent.click(screen.getByText('Test').closest('div')!);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('applies hover styles when onClick is provided', () => {
      const { container } = render(
        <MetricCard title="Test" value={100} onClick={() => {}} />,
      );
      expect(container.firstChild).toHaveClass('cursor-pointer');
      expect(container.firstChild).toHaveClass('hover:shadow-lg');
    });

    it('does not apply hover styles when onClick is not provided', () => {
      const { container } = render(<MetricCard title="Test" value={100} />);
      expect(container.firstChild).not.toHaveClass('cursor-pointer');
    });
  });

  describe('Value Formatting', () => {
    it('formats thousands correctly', () => {
      render(<MetricCard title="Test" value={5000} />);
      expect(screen.getByText('5K')).toBeInTheDocument();
    });

    it('formats millions correctly', () => {
      render(<MetricCard title="Test" value={2500000} />);
      expect(screen.getByText('2.5M')).toBeInTheDocument();
    });

    it('formats billions correctly', () => {
      render(<MetricCard title="Test" value={1000000000} />);
      expect(screen.getByText('1B')).toBeInTheDocument();
    });

    it('formats small numbers correctly', () => {
      render(<MetricCard title="Test" value={42} />);
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });
});
