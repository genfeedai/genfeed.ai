import { AgentStrategyStatus } from '@genfeedai/agent/components/AgentStrategyStatus';
import type { AgentStrategy } from '@genfeedai/agent/models/agent-strategy.model';
import type { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { useAgentStrategyStore } from '@genfeedai/agent/stores/agent-strategy.store';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-01-10T12:00:00.000Z');

function offsetMinutes(minutes: number): string {
  return new Date(NOW.getTime() + minutes * 60_000).toISOString();
}

function makeStrategy(overrides: Partial<AgentStrategy> = {}): AgentStrategy {
  return {
    consecutiveFailures: 0,
    creditsUsedThisWeek: 100,
    creditsUsedToday: 20,
    dailyCreditBudget: 100,
    id: 's-1',
    isActive: true,
    isEnabled: true,
    weeklyCreditBudget: 500,
    ...overrides,
  } as AgentStrategy;
}

interface ApiOverrides {
  runNow?: ReturnType<typeof vi.fn>;
  updateStrategy?: ReturnType<typeof vi.fn>;
}

function makeApi(overrides: ApiOverrides = {}): AgentStrategyApiService {
  return {
    runNow: vi.fn().mockResolvedValue(makeStrategy()),
    updateStrategy: vi
      .fn()
      .mockResolvedValue(makeStrategy({ isEnabled: false })),
    ...overrides,
  } as unknown as AgentStrategyApiService;
}

function progressWidths(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('.h-1\\.5'),
  ).flatMap((node) => (node.style.width ? [node.style.width] : []));
}

describe('AgentStrategyStatus', () => {
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

  it('prompts to create a strategy when none is loaded', () => {
    render(<AgentStrategyStatus apiService={makeApi()} />);

    expect(screen.getByText(/No strategy configured yet/)).toBeInTheDocument();
  });

  it('shows an active strategy with no pause badge', () => {
    useAgentStrategyStore.setState({ strategy: makeStrategy() });

    render(<AgentStrategyStatus apiService={makeApi()} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
  });

  it('marks a disabled strategy paused and inactive', () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy({ isEnabled: false }),
    });

    render(<AgentStrategyStatus apiService={makeApi()} />);

    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Now' })).toBeDisabled();
  });

  it('renders never-run and unscheduled placeholders', () => {
    useAgentStrategyStore.setState({ strategy: makeStrategy() });

    render(<AgentStrategyStatus apiService={makeApi()} />);

    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getByText('Not scheduled')).toBeInTheDocument();
  });

  it('formats past run times across each bucket', () => {
    const cases: Array<[number, string]> = [
      [-0.5, 'Just now'],
      [-30, '30m ago'],
      [-60 * 5, '5h ago'],
      [-60 * 24 * 3, '3d ago'],
    ];

    for (const [minutes, expected] of cases) {
      useAgentStrategyStore.setState({
        strategy: makeStrategy({ lastRunAt: offsetMinutes(minutes) }),
      });

      const { unmount } = render(
        <AgentStrategyStatus apiService={makeApi()} />,
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it('falls back to a date for runs older than a week', () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy({ lastRunAt: offsetMinutes(-60 * 24 * 30) }),
    });

    render(<AgentStrategyStatus apiService={makeApi()} />);

    expect(screen.getByText(/2025/)).toBeInTheDocument();
  });

  it('formats upcoming run times and overdue runs', () => {
    const cases: Array<[number, string]> = [
      [-5, 'Overdue'],
      [30, 'in 30m'],
      [60 * 5, 'in 5h'],
    ];

    for (const [minutes, expected] of cases) {
      useAgentStrategyStore.setState({
        strategy: makeStrategy({ nextRunAt: offsetMinutes(minutes) }),
      });

      const { unmount } = render(
        <AgentStrategyStatus apiService={makeApi()} />,
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it('falls back to a date for runs more than a day out', () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy({ nextRunAt: offsetMinutes(60 * 24 * 5) }),
    });

    render(<AgentStrategyStatus apiService={makeApi()} />);

    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('fills the budget bars proportionally', () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy({
        creditsUsedThisWeek: 250,
        creditsUsedToday: 20,
      }),
    });

    const { container } = render(
      <AgentStrategyStatus apiService={makeApi()} />,
    );

    expect(progressWidths(container)).toEqual(['20%', '50%']);
    expect(screen.getByText('20 / 100')).toBeInTheDocument();
    expect(screen.getByText('250 / 500')).toBeInTheDocument();
  });

  it('caps the bars at full and treats a zero budget as empty', () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy({
        creditsUsedThisWeek: 10,
        creditsUsedToday: 500,
        weeklyCreditBudget: 0,
      }),
    });

    const { container } = render(
      <AgentStrategyStatus apiService={makeApi()} />,
    );

    expect(progressWidths(container)).toEqual(['100%', '0%']);
  });

  it('warns on consecutive failures with correct pluralization', () => {
    useAgentStrategyStore.setState({
      strategy: makeStrategy({ consecutiveFailures: 1 }),
    });
    const { unmount } = render(<AgentStrategyStatus apiService={makeApi()} />);
    expect(screen.getByText(/1 consecutive failure$/)).toBeInTheDocument();
    unmount();

    useAgentStrategyStore.setState({
      strategy: makeStrategy({ consecutiveFailures: 3 }),
    });
    render(<AgentStrategyStatus apiService={makeApi()} />);
    expect(screen.getByText(/3 consecutive failures$/)).toBeInTheDocument();
  });

  it('toggles the enabled flag through the api', async () => {
    const updateStrategy = vi
      .fn()
      .mockResolvedValue(makeStrategy({ isEnabled: false }));
    useAgentStrategyStore.setState({ strategy: makeStrategy() });

    const { container } = render(
      <AgentStrategyStatus apiService={makeApi({ updateStrategy })} />,
    );

    fireEvent.click(container.querySelector('.h-5.w-9') as HTMLElement);

    await waitFor(() => {
      expect(updateStrategy).toHaveBeenCalled();
    });
    expect(updateStrategy.mock.calls[0]?.[1]).toEqual({
      isEnabled: false,
    });
    await waitFor(() => {
      expect(useAgentStrategyStore.getState().strategy?.isEnabled).toBe(false);
    });
  });

  it('swallows a failed toggle', async () => {
    const updateStrategy = vi.fn().mockRejectedValue(new Error('nope'));
    useAgentStrategyStore.setState({ strategy: makeStrategy() });

    const { container } = render(
      <AgentStrategyStatus apiService={makeApi({ updateStrategy })} />,
    );

    fireEvent.click(container.querySelector('.h-5.w-9') as HTMLElement);

    await waitFor(() => {
      expect(updateStrategy).toHaveBeenCalled();
    });
    expect(useAgentStrategyStore.getState().strategy?.isEnabled).toBe(true);
  });

  it('triggers an immediate run', async () => {
    const runNow = vi.fn().mockResolvedValue(makeStrategy());
    useAgentStrategyStore.setState({ strategy: makeStrategy() });

    render(<AgentStrategyStatus apiService={makeApi({ runNow })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run Now' }));

    await waitFor(() => {
      expect(runNow).toHaveBeenCalledWith('s-1', expect.anything());
    });
  });

  it('swallows a failed immediate run', async () => {
    const runNow = vi.fn().mockRejectedValue(new Error('nope'));
    useAgentStrategyStore.setState({ strategy: makeStrategy() });

    render(<AgentStrategyStatus apiService={makeApi({ runNow })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run Now' }));

    await waitFor(() => {
      expect(runNow).toHaveBeenCalled();
    });
  });
});
