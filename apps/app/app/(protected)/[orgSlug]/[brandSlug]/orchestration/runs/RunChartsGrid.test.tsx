import '@testing-library/jest-dom/vitest';
import { AgentExecutionStatus } from '@genfeedai/enums';
import type { IAgentRun } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import RunChartsGrid from './RunChartsGrid';

// recharts is loaded per-primitive through next/dynamic with `ssr: false`, so
// jsdom never resolves the real chart. Stub the loader to a marker element.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => () => {
    void loader;
    return <div data-testid="chart-piece" />;
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    bodyClassName,
    children,
  }: {
    bodyClassName?: string;
    children: ReactNode;
  }) => <section data-body-class={bodyClassName}>{children}</section>,
}));

vi.mock('@ui/dashboard/DashboardGrid', () => ({
  DashboardGrid: ({ children }: { children: ReactNode }) => (
    <div data-testid="dashboard-grid">{children}</div>
  ),
}));

function makeRun(overrides: Partial<IAgentRun> = {}): IAgentRun {
  return {
    id: 'run-1',
    label: 'Writer Agent Run',
    objective: 'Draft launch copy',
    status: AgentExecutionStatus.RUNNING,
    ...overrides,
  } as IAgentRun;
}

describe('RunChartsGrid', () => {
  it('renders the four run charts from trends and run history', () => {
    render(
      <RunChartsGrid
        runs={[
          makeRun(),
          makeRun({ id: 'run-2', status: AgentExecutionStatus.PENDING }),
        ]}
        stats={{
          trends: [
            {
              autoRoutedRate: 0.75,
              bucket: '2026-05-20T00:00:00.000Z',
              totalCreditsUsed: 3.456,
              totalRuns: 4,
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId('run-charts')).toBeVisible();
    expect(screen.getByText('Run Activity')).toBeVisible();
    expect(screen.getByText('Runs by Status')).toBeVisible();
    expect(screen.getByText('Credits by Day')).toBeVisible();
    expect(screen.getByText('Success Rate')).toBeVisible();
    expect(screen.getAllByTestId('chart-piece').length).toBeGreaterThan(0);
  });

  it('falls back to per-chart placeholders when only run history exists', () => {
    render(<RunChartsGrid runs={[makeRun()]} stats={null} />);

    expect(screen.getByTestId('run-charts')).toBeVisible();
    // Status mix is derived from `runs`; the other three read `stats.trends`.
    expect(screen.getAllByText('No data for this period')).toHaveLength(3);
  });

  it('renders nothing when there are no runs or trends', () => {
    const { container } = render(<RunChartsGrid runs={[]} stats={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
