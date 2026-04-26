import { render, screen } from '@testing-library/react';
import StatCard from '@ui/cards/stat-card/StatCard';
import { describe, expect, it, vi } from 'vitest';

// Mock the animated counter hook
vi.mock(
  '@genfeedai/hooks/ui/use-animated-counter/use-animated-counter',
  () => ({
    useAnimatedCounter: ({
      end,
      suffix,
      decimals,
    }: {
      end: number;
      suffix: string;
      decimals: number;
    }) => ({
      ref: { current: null },
      value: `${end.toFixed(decimals)}${suffix}`,
    }),
  }),
);

describe('StatCard', () => {
  const defaultProps = {
    label: 'Total Users',
    value: '1,234',
  };

  it('renders without crashing', () => {
    render(<StatCard {...defaultProps} />);
    expect(screen.getByText('Total Users')).toBeInTheDocument();
  });

  it('renders label', () => {
    render(<StatCard label="Revenue" value="$10K" />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });

  it('renders value', () => {
    render(<StatCard label="Count" value="42" />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<StatCard {...defaultProps} description="vs last month" />);
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    const MockIcon = ({ className }: { className?: string }) => (
      <svg data-testid="stat-icon" className={className} />
    );
    render(<StatCard {...defaultProps} icon={MockIcon} />);
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  it('does not render icon when not provided', () => {
    render(<StatCard {...defaultProps} />);
    expect(screen.queryByTestId('stat-icon')).not.toBeInTheDocument();
  });

  describe('trend display', () => {
    it('shows positive trend', () => {
      render(<StatCard {...defaultProps} trend={15} />);
      expect(screen.getByText(/\+15%/)).toBeInTheDocument();
    });

    it('shows negative trend', () => {
      render(<StatCard {...defaultProps} trend={-5} />);
      expect(screen.getByText(/-5%/)).toBeInTheDocument();
    });

    it('shows zero trend', () => {
      render(<StatCard {...defaultProps} trend={0} />);
      expect(screen.getByText(/0%/)).toBeInTheDocument();
    });

    it('does not show trend when not provided', () => {
      render(<StatCard {...defaultProps} />);
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading skeleton when isLoading is true', () => {
      const { container } = render(
        <StatCard {...defaultProps} isLoading={true} />,
      );
      const loader = container.querySelector('.animate-pulse');
      expect(loader).toBeInTheDocument();
    });

    it('does not show value when loading', () => {
      render(<StatCard {...defaultProps} value="1234" isLoading={true} />);
      expect(screen.queryByText('1234')).not.toBeInTheDocument();
    });

    it('does not show trend when loading', () => {
      render(<StatCard {...defaultProps} trend={10} isLoading={true} />);
      expect(screen.queryByText(/10%/)).not.toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('renders default variant', () => {
      const { container } = render(
        <StatCard {...defaultProps} variant="default" />,
      );
      expect(container.firstChild).toHaveClass('bg-secondary');
      expect(container.firstChild).toHaveClass('ship-ui');
    });

    it('renders white variant', () => {
      const { container } = render(
        <StatCard {...defaultProps} variant="white" />,
      );
      expect(container.firstChild).toHaveClass('bg-white');
      expect(container.firstChild).toHaveClass('text-black');
    });

    it('renders black variant', () => {
      const { container } = render(
        <StatCard {...defaultProps} variant="black" />,
      );
      expect(container.firstChild).toHaveClass('bg-black');
      expect(container.firstChild).toHaveClass('text-white');
    });
  });

  describe('sizes', () => {
    it('renders md size by default', () => {
      const { container } = render(<StatCard {...defaultProps} />);
      expect(container.firstChild?.firstChild).toHaveClass('p-5');
    });

    it('renders sm size', () => {
      const { container } = render(<StatCard {...defaultProps} size="sm" />);
      expect(container.firstChild?.firstChild).toHaveClass('p-4');
    });

    it('renders lg size', () => {
      const { container } = render(<StatCard {...defaultProps} size="lg" />);
      expect(container.firstChild?.firstChild).toHaveClass('p-6');
    });

    it('renders xl size', () => {
      const { container } = render(<StatCard {...defaultProps} size="xl" />);
      expect(container.firstChild?.firstChild).toHaveClass('p-8');
    });
  });

  describe('value animation', () => {
    it('renders numeric string values with animation', () => {
      render(<StatCard label="Users" value="1234" />);
      // AnimatedValue component should render
      expect(screen.getByText(/1234/)).toBeInTheDocument();
    });

    it('renders K-suffixed values', () => {
      render(<StatCard label="Users" value="1K" />);
      expect(screen.getByText(/1/)).toBeInTheDocument();
    });

    it('renders non-numeric values directly', () => {
      render(<StatCard label="Status" value="Active" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders React node values', () => {
      render(
        <StatCard
          label="Status"
          value={<span data-testid="custom-value">Custom</span>}
        />,
      );
      expect(screen.getByTestId('custom-value')).toBeInTheDocument();
    });
  });

  describe('custom className', () => {
    it('applies custom className', () => {
      const { container } = render(
        <StatCard {...defaultProps} className="custom-stat" />,
      );
      expect(container.firstChild).toHaveClass('custom-stat');
    });
  });

  describe('layout', () => {
    it('renders flex column layout', () => {
      const { container } = render(<StatCard {...defaultProps} />);
      expect(container.firstChild).toHaveClass('h-full');
      expect(container.firstChild?.firstChild).toHaveClass('flex');
      expect(container.firstChild?.firstChild).toHaveClass('flex-col');
    });
  });
});
