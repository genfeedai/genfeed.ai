import type { AgentRunSummary } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentWorkspaceRunSummary } from './AgentWorkspaceRunSummary';

vi.mock('@helpers/formatting/cn/cn.util', () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(' '),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    disabled,
    isDisabled,
    isLoading,
    onClick,
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    disabled?: boolean;
    isDisabled?: boolean;
    isLoading?: boolean;
    onClick?: () => void;
  }) => (
    <button
      aria-label={ariaLabel}
      disabled={disabled || isDisabled || isLoading}
      type="button"
      onClick={onClick}
    >
      {isLoading ? 'Loading' : children}
    </button>
  ),
}));

function createRun(overrides: Partial<AgentRunSummary> = {}): AgentRunSummary {
  return {
    id: 'run-1',
    label: 'Long content run',
    startedAt: '2026-07-09T03:00:00.000Z',
    status: 'RUNNING',
    thread: 'thread-1',
    ...overrides,
  };
}

function createApiService(overrides: Record<string, unknown> = {}) {
  return {
    cancelRunEffect: vi.fn((runId: string) =>
      Effect.succeed(createRun({ id: runId, status: 'CANCELLED' })),
    ),
    getActiveRunsEffect: vi.fn(() => Effect.succeed([])),
    ...overrides,
  };
}

describe('AgentWorkspaceRunSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the empty active-run state', async () => {
    const apiService = createApiService();

    render(<AgentWorkspaceRunSummary apiService={apiService as never} />);

    await screen.findByText('No active runs');

    expect(screen.getByText(/New agent work will appear/)).toBeInTheDocument();
    expect(apiService.getActiveRunsEffect).toHaveBeenCalledTimes(1);
  });

  it('opens and cancels an active run with a thread handoff', async () => {
    const onOpenThread = vi.fn();
    const apiService = createApiService({
      getActiveRunsEffect: vi.fn(() => Effect.succeed([createRun()])),
    });

    render(
      <AgentWorkspaceRunSummary
        apiService={apiService as never}
        onOpenThread={onOpenThread}
      />,
    );

    await screen.findByText('Long content run');

    fireEvent.click(screen.getByLabelText('Open Long content run thread'));
    expect(onOpenThread).toHaveBeenCalledWith('thread-1');

    fireEvent.click(screen.getByLabelText('Cancel Long content run'));

    await waitFor(() => {
      expect(apiService.cancelRunEffect).toHaveBeenCalledWith('run-1');
    });
    await screen.findByText('Cancelled');
  });

  it('shows a load error and retries active-run fetches', async () => {
    const apiService = createApiService({
      getActiveRunsEffect: vi
        .fn()
        .mockReturnValueOnce(Effect.fail(new Error('Failed to load runs')))
        .mockReturnValueOnce(
          Effect.succeed([
            createRun({
              id: 'run-2',
              label: 'Queued import',
              startedAt: undefined,
              status: 'PENDING',
              thread: undefined,
            }),
          ]),
        ),
    });

    render(<AgentWorkspaceRunSummary apiService={apiService as never} />);

    await screen.findByText('Failed to load runs');

    fireEvent.click(screen.getByText('Retry'));

    await screen.findByText('Queued import');
    expect(apiService.getActiveRunsEffect).toHaveBeenCalledTimes(2);
  });
});
