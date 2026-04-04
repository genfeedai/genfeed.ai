import type { IAgentRun } from '@genfeedai/interfaces';
import { AgentExecutionStatus, AgentExecutionTrigger } from '@genfeedai/enums';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import { render, screen } from '@testing-library/react';
import type { Key, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  OverviewOperationsSection,
  OverviewPerformanceChartSection,
  OverviewPublishingInboxSection,
  OverviewStatusBadge,
  OverviewTopStatStrip,
} from './overview-dashboard-sections';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    columns,
    emptyState,
    getRowKey,
    items,
  }: {
    columns: Array<{
      header: ReactNode;
      key: string;
      render?: (item: IAgentRun) => ReactNode;
    }>;
    emptyState?: ReactNode;
    getRowKey?: (item: IAgentRun, index: number) => Key;
    items: IAgentRun[];
  }) =>
    items.length === 0 ? (
      <div>{emptyState}</div>
    ) : (
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={getRowKey?.(item, index) ?? item.id}>
              {columns.map((column) => (
                <td key={String(column.key)}>
                  {column.render
                    ? column.render(item)
                    : String(item[column.key as keyof IAgentRun] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ),
}));

vi.mock(
  '@ui/analytics/charts/platform-time-series/platform-time-series-chart',
  () => ({
    PlatformTimeSeriesChart: ({
      data,
      platforms,
    }: {
      data: PlatformTimeSeriesDataPoint[];
      platforms: string[];
    }) => (
      <div data-testid="overview-performance-chart">
        {platforms.join(',')}:{data.length}
      </div>
    ),
  }),
);

const RUNS: IAgentRun[] = [
  {
    completedAt: '2026-03-12T09:00:00.000Z',
    conversation: undefined,
    createdAt: '2026-03-12T08:45:00.000Z',
    creditBudget: undefined,
    creditsUsed: 14,
    durationMs: 32000,
    id: 'run-1',
    label: 'Creator autopilot',
    metadata: {
      actualModel: 'google/gemini-2.5-flash',
      requestedModel: 'openrouter/auto',
    },
    objective: 'Publish today',
    organization: 'org-1',
    parentRun: undefined,
    progress: 100,
    retryCount: 0,
    startedAt: '2026-03-12T08:46:00.000Z',
    status: AgentExecutionStatus.COMPLETED,
    strategy: 'Daily publishing',
    summary: undefined,
    toolCalls: [],
    trigger: AgentExecutionTrigger.CRON,
    updatedAt: '2026-03-12T09:00:00.000Z',
    user: 'user-1',
  },
  {
    completedAt: undefined,
    conversation: undefined,
    createdAt: '2026-03-12T10:05:00.000Z',
    creditBudget: undefined,
    creditsUsed: 3,
    durationMs: undefined,
    id: 'run-2',
    label: 'Reply bot recovery',
    metadata: {
      requestedModel: 'anthropic/claude-sonnet-4-5',
    },
    objective: 'Handle mentions',
    organization: 'org-1',
    parentRun: undefined,
    progress: 45,
    retryCount: 1,
    startedAt: '2026-03-12T10:06:00.000Z',
    status: AgentExecutionStatus.RUNNING,
    strategy: 'Engagement',
    summary: undefined,
    toolCalls: [],
    trigger: AgentExecutionTrigger.EVENT,
    updatedAt: '2026-03-12T10:10:00.000Z',
    user: 'user-1',
  },
  {
    completedAt: '2026-03-12T07:35:00.000Z',
    conversation: undefined,
    createdAt: '2026-03-12T07:20:00.000Z',
    creditBudget: undefined,
    creditsUsed: 5,
    durationMs: 12000,
    error: 'Posting API timeout',
    id: 'run-3',
    label: 'Campaign publish batch',
    metadata: undefined,
    objective: 'Ship scheduled posts',
    organization: 'org-1',
    parentRun: undefined,
    progress: 100,
    retryCount: 0,
    startedAt: '2026-03-12T07:21:00.000Z',
    status: AgentExecutionStatus.FAILED,
    strategy: 'Campaign launch',
    summary: undefined,
    toolCalls: [],
    trigger: AgentExecutionTrigger.MANUAL,
    updatedAt: '2026-03-12T07:35:00.000Z',
    user: 'user-1',
  },
];

const SERIES: PlatformTimeSeriesDataPoint[] = [
  {
    date: '2026-03-10',
    instagram: 1200,
    linkedin: 300,
  },
  {
    date: '2026-03-11',
    instagram: 1650,
    linkedin: 420,
  },
];

const REVIEW_ITEMS = [
  {
    batchId: 'batch-1',
    createdAt: '2026-03-25T10:00:00.000Z',
    format: 'image',
    id: 'item-1',
    mediaUrl: 'https://cdn.example.com/image.png',
    platform: 'instagram',
    postId: 'post-1',
    reviewDecision: undefined,
    status: 'completed',
    summary: 'Autopilot image review',
  },
  {
    batchId: 'batch-2',
    createdAt: '2026-03-25T09:00:00.000Z',
    format: 'newsletter',
    id: 'item-2',
    platform: 'email',
    reviewDecision: undefined,
    status: 'completed',
    summary: 'Weekly newsletter draft',
  },
];

describe('Overview dashboard sections', () => {
  it('renders the status badge tone and label', () => {
    render(<OverviewStatusBadge status={AgentExecutionStatus.RUNNING} />);

    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders compact top stats with accent copy', () => {
    render(
      <OverviewTopStatStrip
        items={[
          {
            accent: '3 completed today',
            label: 'Live Runs',
            value: '2',
          },
        ]}
      />,
    );

    expect(screen.getByText('Live Runs')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3 completed today')).toBeInTheDocument();
  });

  it('renders recent run rows in descending update order', () => {
    render(<OverviewOperationsSection runs={RUNS} />);

    expect(screen.getByText('Active And Recent Runs')).toBeInTheDocument();
    expect(screen.getByText('Showing 3 of 3 runs')).toBeInTheDocument();

    expect(screen.getByText('Creator autopilot')).toBeInTheDocument();
    expect(screen.getByText('Reply bot recovery')).toBeInTheDocument();
    expect(screen.getByText('Campaign publish batch')).toBeInTheDocument();

    const runRows = screen.getAllByRole('row');
    expect(runRows[1]).toHaveTextContent('Reply bot recovery');
    expect(runRows[1]).toHaveTextContent('anthropic/claude-sonnet-4-5');
    expect(runRows[2]).toHaveTextContent('Creator autopilot');
    expect(runRows[2]).toHaveTextContent(
      'google/gemini-2.5-flash via openrouter/auto',
    );
    expect(runRows[3]).toHaveTextContent('Campaign publish batch');
  });

  it('renders the performance chart section with chart data', async () => {
    render(
      <OverviewPerformanceChartSection
        data={SERIES}
        platforms={['instagram', 'linkedin']}
      />,
    );

    expect(screen.getByText('Platform Momentum Over Time')).toBeInTheDocument();
    expect(
      await screen.findByTestId('overview-performance-chart'),
    ).toHaveTextContent('instagram,linkedin:2');
  });

  it('renders the publishing inbox section with ready items and review CTA', () => {
    render(
      <OverviewPublishingInboxSection
        readyCount={3}
        recentItems={REVIEW_ITEMS}
      />,
    );

    expect(screen.getByText('Publishing Inbox')).toBeInTheDocument();
    expect(
      screen.getByText('3 items ready for human review'),
    ).toBeInTheDocument();
    expect(screen.getByText('Autopilot image review')).toBeInTheDocument();
    expect(screen.getByText('Weekly newsletter draft')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Queue' })).toHaveAttribute(
      'href',
      '/posts/review',
    );
  });
});
