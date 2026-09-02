import DynamicChartView from '@genfeedai/agent/components/blocks/DynamicChartView';
import type { ChartBlock } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Recharts measures real layout, which jsdom cannot provide. These stubs keep
// the chart's own mapping logic under test while rendering deterministically.
vi.mock('recharts', () => {
  function makeContainer(testId: string) {
    return ({ children }: { children?: ReactNode }): ReactElement => (
      <div data-testid={testId}>{children}</div>
    );
  }

  function makeSeries(testId: string) {
    return ({
      dataKey,
      fill,
      name,
      stroke,
    }: {
      dataKey?: string;
      fill?: string;
      name?: string;
      stroke?: string;
    }): ReactElement => (
      <div
        data-color={stroke ?? fill}
        data-key={dataKey}
        data-name={name}
        data-testid={testId}
      />
    );
  }

  return {
    Area: makeSeries('area'),
    AreaChart: makeContainer('area-chart'),
    Bar: makeSeries('bar'),
    BarChart: makeContainer('bar-chart'),
    CartesianGrid: () => <div data-testid="grid" />,
    Cell: ({ fill }: { fill?: string }) => (
      <div data-fill={fill} data-testid="cell" />
    ),
    Legend: () => <div data-testid="legend" />,
    Line: makeSeries('line'),
    LineChart: makeContainer('line-chart'),
    Pie: ({
      children,
      dataKey,
      nameKey,
    }: {
      children?: ReactNode;
      dataKey?: string;
      nameKey?: string;
    }) => (
      <div data-key={dataKey} data-name-key={nameKey} data-testid="pie">
        {children}
      </div>
    ),
    PieChart: makeContainer('pie-chart'),
    ResponsiveContainer: ({
      children,
      height,
    }: {
      children?: ReactNode;
      height?: number;
    }) => (
      <div data-height={height} data-testid="responsive">
        {children}
      </div>
    ),
    Tooltip: () => <div data-testid="tooltip" />,
    XAxis: ({ dataKey }: { dataKey?: string }) => (
      <div data-key={dataKey} data-testid="x-axis" />
    ),
    YAxis: () => <div data-testid="y-axis" />,
  };
});

function makeBlock(overrides: Partial<ChartBlock> = {}): ChartBlock {
  return {
    chartType: 'bar',
    data: [
      { clicks: 5, name: 'Mon', views: 10 },
      { clicks: 8, name: 'Tue', views: 20 },
    ],
    id: 'chart-1',
    type: 'chart',
    ...overrides,
  } as ChartBlock;
}

function seriesKeys(testId: string): string[] {
  return screen
    .getAllByTestId(testId)
    .map((node) => node.getAttribute('data-key') ?? '');
}

describe('DynamicChartView', () => {
  it('renders a bar chart by default and infers numeric series', () => {
    render(<DynamicChartView block={makeBlock()} />);

    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(seriesKeys('bar')).toEqual(['clicks', 'views']);
  });

  it('excludes the x-axis key and non-numeric fields from inferred series', () => {
    render(
      <DynamicChartView
        block={makeBlock({
          data: [{ id: 'a', label: 'x', name: 'Mon', views: 10 }],
        })}
      />,
    );

    expect(seriesKeys('bar')).toEqual(['views']);
  });

  it('honours an explicit x-axis key', () => {
    render(
      <DynamicChartView
        block={makeBlock({
          data: [{ day: 'Mon', views: 10 }],
          xAxis: 'day',
        })}
      />,
    );

    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-key', 'day');
    expect(seriesKeys('bar')).toEqual(['views']);
  });

  it('uses the configured series keys, labels and colors', () => {
    render(
      <DynamicChartView
        block={makeBlock({
          series: [{ color: '#ff0000', key: 'views', label: 'Impressions' }],
        })}
      />,
    );

    const bar = screen.getByTestId('bar');

    expect(bar).toHaveAttribute('data-key', 'views');
    expect(bar).toHaveAttribute('data-name', 'Impressions');
    expect(bar).toHaveAttribute('data-color', '#ff0000');
  });

  it('falls back to the palette and the raw key when unconfigured', () => {
    render(
      <DynamicChartView block={makeBlock({ series: [{ key: 'views' }] })} />,
    );

    const bar = screen.getByTestId('bar');

    expect(bar).toHaveAttribute('data-name', 'views');
    expect(bar).toHaveAttribute('data-color', '#8884d8');
  });

  it('renders an area chart', () => {
    render(<DynamicChartView block={makeBlock({ chartType: 'area' })} />);

    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    expect(seriesKeys('area')).toEqual(['clicks', 'views']);
  });

  it('renders a line chart', () => {
    render(<DynamicChartView block={makeBlock({ chartType: 'line' })} />);

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(seriesKeys('line')).toEqual(['clicks', 'views']);
  });

  it('renders a pie chart with one cell per datum', () => {
    render(<DynamicChartView block={makeBlock({ chartType: 'pie' })} />);

    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    expect(screen.getByTestId('pie')).toHaveAttribute('data-key', 'clicks');
    expect(screen.getAllByTestId('cell')).toHaveLength(2);
  });

  it('defaults the pie data key when no numeric series exist', () => {
    render(
      <DynamicChartView
        block={makeBlock({
          chartType: 'pie',
          data: [{ name: 'Mon' }],
        })}
      />,
    );

    expect(screen.getByTestId('pie')).toHaveAttribute('data-key', 'value');
  });

  it('hides the legend and grid when disabled', () => {
    render(
      <DynamicChartView
        block={makeBlock({ showGrid: false, showLegend: false })}
      />,
    );

    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('grid')).not.toBeInTheDocument();
  });

  it('hides the legend on a pie chart when disabled', () => {
    render(
      <DynamicChartView
        block={makeBlock({ chartType: 'pie', showLegend: false })}
      />,
    );

    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
  });

  it('applies the configured height', () => {
    render(<DynamicChartView block={makeBlock({ height: 420 })} />);

    expect(screen.getByTestId('responsive')).toHaveAttribute(
      'data-height',
      '420',
    );
  });

  it('shows an empty state when there is no data', () => {
    render(<DynamicChartView block={makeBlock({ data: [] })} />);

    expect(screen.getByText('No chart data available')).toBeInTheDocument();
  });

  it('renders skeleton bars while hydrating', () => {
    const hydrating = {
      ...makeBlock(),
      hydration: { status: 'loading' as const },
    } as ChartBlock;

    const { container } = render(<DynamicChartView block={hydrating} />);

    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
  });
});
