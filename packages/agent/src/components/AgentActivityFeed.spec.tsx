import { AgentActivityFeed } from '@genfeedai/agent/components/AgentActivityFeed';
import type {
  AgentStrategy,
  AgentStrategyRun,
} from '@genfeedai/agent/models/agent-strategy.model';
import type { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { useAgentStrategyStore } from '@genfeedai/agent/stores/agent-strategy.store';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-01-10T12:00:00.000Z');

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function makeRun(overrides: Partial<AgentStrategyRun> = {}): AgentStrategyRun {
  return {
    contentGenerated: 3,
    creditsUsed: 25,
    startedAt: minutesAgo(5),
    status: 'completed',
    ...overrides,
  };
}

function makeStrategy(runHistory: AgentStrategyRun[]): AgentStrategy {
  return { id: 's-1', runHistory } as AgentStrategy;
}

function makeApi(strategies: AgentStrategy[]): AgentStrategyApiService {
  return {
    getStrategies: vi.fn().mockResolvedValue(strategies),
  } as unknown as AgentStrategyApiService;
}

describe('AgentActivityFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    useAgentStrategyStore.setState(
      useAgentStrategyStore.getInitialState(),
      true,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the empty state when there are no runs', async () => {
    render(<AgentActivityFeed apiService={makeApi([makeStrategy([])])} />);

    await waitFor(() => {
      expect(screen.getByText('No activity yet')).toBeInTheDocument();
    });
  });

  it('fetches the strategy only when the store has none', async () => {
    const api = makeApi([makeStrategy([makeRun()])]);
    useAgentStrategyStore.setState({ strategy: makeStrategy([makeRun()]) });

    render(<AgentActivityFeed apiService={api} />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });
    expect(api.getStrategies).not.toHaveBeenCalled();
  });

  it('records a load failure in the store', async () => {
    render(
      <AgentActivityFeed
        apiService={
          {
            getStrategies: vi.fn().mockRejectedValue(new Error('nope')),
          } as unknown as AgentStrategyApiService
        }
      />,
    );

    await waitFor(() => {
      expect(useAgentStrategyStore.getState().error).toBe('nope');
    });
  });

  it('lists runs newest first with credits and generated counts', async () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy([
        makeRun({ contentGenerated: 1, startedAt: minutesAgo(600) }),
        makeRun({ contentGenerated: 9, startedAt: minutesAgo(2) }),
      ]),
    });

    render(<AgentActivityFeed apiService={makeApi([])} />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });

    const entries = screen.getAllByText(/content generated/);
    expect(entries[0]).toHaveTextContent('9 content generated');
    expect(entries[1]).toHaveTextContent('1 content generated');
    expect(screen.getAllByText('25 credits')).toHaveLength(2);
  });

  it('renders a badge per run status', async () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy([
        makeRun({ startedAt: minutesAgo(1), status: 'completed' }),
        makeRun({ startedAt: minutesAgo(2), status: 'failed' }),
        makeRun({ startedAt: minutesAgo(3), status: 'budget_exhausted' }),
      ]),
    });

    render(<AgentActivityFeed apiService={makeApi([])} />);

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Budget')).toBeInTheDocument();
  });

  it('formats relative run times across each bucket', async () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy([
        makeRun({ startedAt: minutesAgo(0) }),
        makeRun({ startedAt: minutesAgo(30) }),
        makeRun({ startedAt: minutesAgo(60 * 5) }),
        makeRun({ startedAt: minutesAgo(60 * 24 * 3) }),
        makeRun({ startedAt: minutesAgo(60 * 24 * 30) }),
      ]),
    });

    render(<AgentActivityFeed apiService={makeApi([])} />);

    await waitFor(() => {
      expect(screen.getByText(/Just now/)).toBeInTheDocument();
    });
    expect(screen.getByText(/30m ago/)).toBeInTheDocument();
    expect(screen.getByText(/5h ago/)).toBeInTheDocument();
    expect(screen.getByText(/3d ago/)).toBeInTheDocument();
    expect(screen.getByText(/12\/11\/2025/)).toBeInTheDocument();
  });

  it('appends the run duration when a completion time exists', async () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy([
        makeRun({
          completedAt: minutesAgo(4),
          startedAt: minutesAgo(5),
        }),
      ]),
    });

    render(<AgentActivityFeed apiService={makeApi([])} />);

    await waitFor(() => {
      expect(screen.getByText(/— 60s/)).toBeInTheDocument();
    });
  });

  it('offers a thread link only when both a thread and handler exist', async () => {
    const onViewThread = vi.fn();
    useAgentStrategyStore.setState({
      strategy: makeStrategy([
        makeRun({ startedAt: minutesAgo(1), threadId: 't-1' }),
        makeRun({ startedAt: minutesAgo(2) }),
      ]),
    });

    render(
      <AgentActivityFeed
        apiService={makeApi([])}
        onViewThread={onViewThread}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(onViewThread).toHaveBeenCalledWith('t-1');
  });

  it('hides thread links when no handler is supplied', async () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy([makeRun({ threadId: 't-1' })]),
    });

    render(<AgentActivityFeed apiService={makeApi([])} />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'View' }),
    ).not.toBeInTheDocument();
  });
});
