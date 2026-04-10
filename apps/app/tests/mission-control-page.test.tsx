import { AgentExecutionStatus, AgentExecutionTrigger } from '@genfeedai/enums';
import type { IAgentRun } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MissionControl from '../app/(protected)/[orgSlug]/[brandSlug]/orchestration/runs/mission-control';

const replaceMock = vi.fn();
let currentSearchParams = new URLSearchParams();
const useAgentRunsMock = vi.fn();

const runs: IAgentRun[] = [
  {
    completedAt: '2026-03-26T10:15:00.000Z',
    conversation: undefined,
    createdAt: '2026-03-26T10:00:00.000Z',
    creditBudget: undefined,
    creditsUsed: 6,
    durationMs: 18000,
    id: 'run-1',
    label: 'Trend scan',
    metadata: {
      actualModel: 'google/gemini-2.5-flash',
      requestedModel: 'openrouter/auto',
      routingPolicy: 'fresh-live-data',
      webSearchEnabled: true,
    },
    objective: 'Find latest creator trends',
    organization: 'org-1',
    parentRun: undefined,
    progress: 100,
    retryCount: 0,
    startedAt: '2026-03-26T10:01:00.000Z',
    status: AgentExecutionStatus.COMPLETED,
    summary: undefined,
    toolCalls: [],
    trigger: AgentExecutionTrigger.MANUAL,
    updatedAt: '2026-03-26T10:15:00.000Z',
    user: 'user-1',
  },
  {
    completedAt: '2026-03-26T08:15:00.000Z',
    conversation: undefined,
    createdAt: '2026-03-26T08:00:00.000Z',
    creditBudget: undefined,
    creditsUsed: 3,
    durationMs: 9000,
    id: 'run-2',
    label: 'Caption draft',
    metadata: {
      actualModel: 'anthropic/claude-sonnet-4-5',
      requestedModel: 'anthropic/claude-sonnet-4-5',
    },
    objective: 'Write captions',
    organization: 'org-1',
    parentRun: undefined,
    progress: 100,
    retryCount: 0,
    startedAt: '2026-03-26T08:01:00.000Z',
    status: AgentExecutionStatus.COMPLETED,
    summary: undefined,
    toolCalls: [],
    trigger: AgentExecutionTrigger.MANUAL,
    updatedAt: '2026-03-26T08:15:00.000Z',
    user: 'user-1',
  },
];

const stats = {
  activeRuns: 1,
  anomalies: [
    {
      baselineValue: 0.2,
      currentValue: 0.55,
      description: 'Auto-routing jumped materially above the recent baseline.',
      kind: 'auto_routing_spike' as const,
      severity: 'warning' as const,
      title: 'Auto-routing spike',
    },
  ],
  autoRoutedRuns: 1,
  completedToday: 2,
  failedToday: 0,
  routingPaths: [
    {
      actualModel: 'google/gemini-2.5-flash',
      count: 1,
      requestedModel: 'openrouter/auto',
    },
  ],
  timeRange: '7d' as const,
  topActualModels: [{ count: 1, model: 'google/gemini-2.5-flash' }],
  topRequestedModels: [{ count: 1, model: 'openrouter/auto' }],
  totalCreditsToday: 9,
  totalRuns: 2,
  trends: [
    {
      autoRoutedRate: 0.5,
      autoRoutedRuns: 1,
      averageCreditsUsed: 4.5,
      bucket: '2026-03-25',
      totalCreditsUsed: 9,
      totalRuns: 2,
      webEnabledRate: 0.5,
      webEnabledRuns: 1,
    },
  ],
  webEnabledRuns: 1,
};

vi.mock('@hooks/data/agent-runs/use-agent-runs', () => ({
  useAgentRuns: (options: unknown) => useAgentRunsMock(options),
}));

vi.mock('@hooks/data/agent-runs/use-active-agent-runs', () => ({
  useActiveAgentRuns: () => ({
    activeRuns: [],
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/orchestration/runs',
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Refresh
    </button>
  ),
}));

vi.mock(
  '../app/(protected)/[orgSlug]/[brandSlug]/orchestration/runs/ActiveRunsPanel',
  () => ({
    default: () => <div data-testid="active-runs-panel" />,
  }),
);

vi.mock(
  '../app/(protected)/[orgSlug]/[brandSlug]/orchestration/runs/RunHistoryList',
  () => ({
    default: ({ runs }: { runs: IAgentRun[] }) => (
      <div data-testid="run-history-list">
        {runs.map((run) => run.label).join(',')}
      </div>
    ),
  }),
);

function mockUseAgentRunsImplementation() {
  useAgentRunsMock.mockImplementation((options?: Record<string, unknown>) => {
    const filteredRuns = runs.filter((run) => {
      const query = String(options?.q ?? '').toLowerCase();
      const model = options?.model;

      if (
        query &&
        ![
          run.label,
          run.objective ?? '',
          String(run.metadata?.actualModel ?? ''),
          String(run.metadata?.requestedModel ?? ''),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }

      if (!model) {
        return true;
      }

      return (
        run.metadata?.actualModel === model ||
        run.metadata?.requestedModel === model
      );
    });

    return {
      cancelRun: vi.fn(),
      isLoading: false,
      refresh: vi.fn(),
      runs: filteredRuns,
      stats: {
        ...stats,
        timeRange:
          (options?.timeRange as typeof stats.timeRange | undefined) ?? '7d',
      },
    };
  });
}

describe('MissionControl', () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams();
    replaceMock.mockReset();
    useAgentRunsMock.mockReset();
    mockUseAgentRunsImplementation();
  });

  it('passes API-backed filter params and shows routing analytics', () => {
    render(<MissionControl />);

    expect(useAgentRunsMock).toHaveBeenCalledWith({
      historyOnly: true,
      model: undefined,
      q: undefined,
      sortMode: 'latest',
      timeRange: '7d',
    });
    expect(screen.getByText('Routing Paths')).toBeInTheDocument();
    expect(screen.getByText('Routing Trends')).toBeInTheDocument();
    expect(screen.getByText('Routing Anomalies')).toBeInTheDocument();
    expect(screen.getByText('Top Requested Model')).toBeInTheDocument();
    expect(
      screen.getAllByText('google/gemini-2.5-flash').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText('openrouter/auto -> google/gemini-2.5-flash'),
    ).toBeInTheDocument();
  });

  it('syncs model filter and range into URL and API query', () => {
    render(<MissionControl />);

    fireEvent.change(screen.getByDisplayValue('All models'), {
      target: { value: 'anthropic/claude-sonnet-4-5' },
    });
    fireEvent.change(screen.getByDisplayValue('Window: 7d'), {
      target: { value: '30d' },
    });

    const latestCall = useAgentRunsMock.mock.calls.at(-1)?.[0];
    expect(latestCall).toMatchObject({
      historyOnly: true,
      model: 'anthropic/claude-sonnet-4-5',
      sortMode: 'latest',
      timeRange: '30d',
    });
    expect(screen.getByTestId('run-history-list')).toHaveTextContent(
      'Caption draft',
    );
    expect(screen.getByTestId('run-history-list')).not.toHaveTextContent(
      'Trend scan',
    );
    expect(replaceMock).toHaveBeenCalledWith(
      '/orchestration/runs?model=anthropic%2Fclaude-sonnet-4-5&range=30d',
      { scroll: false },
    );
  });

  it('syncs search and sort into URL and API query', () => {
    render(<MissionControl />);

    fireEvent.change(
      screen.getByPlaceholderText('Search runs, objectives, or routing'),
      { target: { value: 'trend' } },
    );
    fireEvent.change(screen.getByDisplayValue('Sort: Latest'), {
      target: { value: 'credits' },
    });

    const latestCall = useAgentRunsMock.mock.calls.at(-1)?.[0];
    expect(latestCall).toMatchObject({
      historyOnly: true,
      q: 'trend',
      sortMode: 'credits',
      timeRange: '7d',
    });
    expect(screen.getByTestId('run-history-list')).toHaveTextContent(
      'Trend scan',
    );
    expect(replaceMock).toHaveBeenCalledWith(
      '/orchestration/runs?q=trend&sort=credits',
      { scroll: false },
    );
  });
});
