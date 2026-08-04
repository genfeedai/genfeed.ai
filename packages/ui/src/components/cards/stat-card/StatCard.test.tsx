import { render, screen } from '@testing-library/react';
import StatCard from '@ui/cards/stat-card/StatCard';
import { describe, expect, it, vi } from 'vitest';

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

describe('StatCard (MetricCard alias)', () => {
  const defaultProps = {
    label: 'Total Users',
    value: '1,234',
  };

  it('renders label and value', () => {
    render(<StatCard {...defaultProps} />);
    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<StatCard {...defaultProps} description="vs last month" />);
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('shows trend only when provided', () => {
    const { rerender } = render(<StatCard {...defaultProps} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();

    rerender(<StatCard {...defaultProps} trend={15} />);
    expect(screen.getByText('+15%')).toBeInTheDocument();

    rerender(<StatCard {...defaultProps} trend={-5} />);
    expect(screen.getByText('-5%')).toBeInTheDocument();

    rerender(<StatCard {...defaultProps} trend={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoading', () => {
    const { container } = render(
      <StatCard {...defaultProps} isLoading value="1234" />,
    );
    expect(screen.queryByText('1234')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});
