import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverviewMetric, OverviewMetricGrid } from './OverviewMetric';

describe('OverviewMetric', () => {
  it('renders via shared MetricCard (sm)', () => {
    render(<OverviewMetric label="Active runs" value="3" />);

    expect(screen.getByText('Active runs')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows trend only when provided', () => {
    const { rerender } = render(<OverviewMetric label="Users" value="6" />);
    expect(screen.queryByText(/%/)).toBeNull();

    rerender(<OverviewMetric label="Users" value="6" trend={-5} />);
    expect(screen.getByText('-5%')).toBeInTheDocument();
  });
});

describe('OverviewMetricGrid', () => {
  it('renders children', () => {
    render(
      <OverviewMetricGrid columns={3}>
        <OverviewMetric label="A" value="1" />
        <OverviewMetric label="B" value="2" />
      </OverviewMetricGrid>,
    );

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});
