import '@testing-library/jest-dom/vitest';
import type { SeriesChartDataPoint } from '@genfeedai/props/analytics/series-chart.props';
import { render, screen } from '@testing-library/react';
import { SeriesChart } from '@ui/analytics/charts/series/series-chart';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/charts', () => ({
  ChartContainer: ({
    'aria-label': ariaLabel,
    children,
  }: {
    'aria-label'?: string;
    children: React.ReactNode;
  }) => (
    <div role="img" aria-label={ariaLabel}>
      {children}
    </div>
  ),
  ChartTooltipContent: () => null,
}));

vi.mock('recharts', () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Area: Stub,
    AreaChart: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="area-chart">{children}</div>
    ),
    Bar: Stub,
    BarChart: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="bar-chart">{children}</div>
    ),
    CartesianGrid: Stub,
    Tooltip: Stub,
    XAxis: Stub,
    YAxis: Stub,
  };
});

const series = [
  { color: 'hsl(var(--success))', key: 'revenue', label: 'Revenue' },
  { color: 'hsl(var(--destructive))', key: 'cost', label: 'Cost' },
] as const;

const data: SeriesChartDataPoint[] = [
  { cost: 1, date: '2026-09-01', revenue: 10 },
  { cost: 0, date: '2026-09-02', revenue: 0 },
];

const formatter = (value: number) => `$${value}`;

describe('SeriesChart', () => {
  it('draws overlaid areas with a legend entry per series', async () => {
    render(
      <SeriesChart
        ariaLabel="Revenue per day"
        data={data}
        emptyLabel="Nothing yet"
        series={series}
        valueFormatter={formatter}
        variant="area"
      />,
    );

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Revenue per day' }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('area-chart')).toBeInTheDocument();
  });

  it('stacks bars for the stackedBar variant', async () => {
    render(
      <SeriesChart
        ariaLabel="Cost per day"
        data={data}
        emptyLabel="Nothing yet"
        series={series}
        valueFormatter={formatter}
        variant="stackedBar"
      />,
    );

    expect(await screen.findByTestId('bar-chart')).toBeInTheDocument();
  });

  it('shows the empty label when every value is zero', () => {
    render(
      <SeriesChart
        ariaLabel="Revenue per day"
        data={[{ cost: 0, date: '2026-09-01', revenue: 0 }]}
        emptyLabel="Nothing yet"
        series={series}
        valueFormatter={formatter}
        variant="area"
      />,
    );

    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
