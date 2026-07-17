import type {
  AgentRunPage,
  AgentRunSummary,
} from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentWorkspaceRunSummary } from './AgentWorkspaceRunSummary';

vi.mock('@helpers/formatting/cn/cn.util', () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(' '),
}));

interface MockButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ariaLabel?: string;
  children?: ReactNode;
  isDisabled?: boolean;
  isLoading?: boolean;
  withWrapper?: boolean;
}

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    isDisabled,
    isLoading,
    withWrapper: _withWrapper,
    ...props
  }: MockButtonProps) => (
    <button
      {...props}
      aria-label={ariaLabel}
      disabled={props.disabled || isDisabled || isLoading}
      type="button"
    >
      {isLoading ? 'Loading' : children}
    </button>
  ),
}));

function createRun(overrides: Partial<AgentRunSummary> = {}): AgentRunSummary {
  return {
    createdAt: '2026-07-09T03:00:00.000Z',
    creditsUsed: 4,
    id: 'run-1',
    label: 'Long content run',
    metadata: {
      actualModel: 'openai/gpt-5',
      agentScope: { brandId: 'brand-1' },
      source: 'agent',
    },
    progress: 50,
    startedAt: '2026-07-09T03:00:00.000Z',
    status: 'RUNNING',
    steps: [{ id: 'step-1', label: 'Research', status: 'RUNNING' }],
    thread: 'thread-1',
    toolCalls: [
      { durationMs: 800, status: 'completed', toolName: 'web_search' },
    ],
    trigger: 'MANUAL',
    ...overrides,
  };
}

function createPage(
  runs: AgentRunSummary[],
  overrides: Partial<AgentRunPage['pagination']> = {},
): AgentRunPage {
  return {
    pagination: {
      limit: 10,
      page: 1,
      pages: runs.length ? 1 : 0,
      total: runs.length,
      ...overrides,
    },
    runs,
  };
}

function createApiService(overrides: Record<string, unknown> = {}) {
  return {
    cancelRunEffect: vi.fn((runId: string) =>
      Effect.succeed(createRun({ id: runId, status: 'CANCELLED' })),
    ),
    getRunEffect: vi.fn((runId: string) =>
      Effect.succeed(createRun({ id: runId })),
    ),
    listRunsEffect: vi.fn(() => Effect.succeed(createPage([]))),
    retryRunEffect: vi.fn((runId: string) =>
      Effect.succeed(createRun({ id: runId, status: 'PENDING' })),
    ),
    ...overrides,
  };
}

describe('AgentWorkspaceRunSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an accessible empty operator workspace', async () => {
    const apiService = createApiService();

    render(
      <AgentWorkspaceRunSummary
        apiService={apiService as never}
        brandId="brand-1"
      />,
    );

    await screen.findByText('No agent runs yet');

    expect(
      screen.getByRole('heading', { name: '0 runs · 0 active on page' }),
    ).toBeInTheDocument();
    expect(apiService.listRunsEffect).toHaveBeenCalledWith(
      { brandId: 'brand-1', limit: 10, page: 1 },
      expect.any(AbortSignal),
    );
    expect(apiService.getRunEffect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Collapse agent operations'));
    expect(screen.queryByText('No agent runs yet')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Expand agent operations')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('inspects provenance and controls a brand-scoped run', async () => {
    const onOpenThread = vi.fn();
    const run = createRun();
    const apiService = createApiService({
      getRunEffect: vi.fn(() => Effect.succeed(run)),
      listRunsEffect: vi.fn(() => Effect.succeed(createPage([run]))),
    });

    render(
      <AgentWorkspaceRunSummary
        apiService={apiService as never}
        brandId="brand-1"
        onOpenThread={onOpenThread}
      />,
    );

    await screen.findByText('web_search');
    expect(screen.getByText('openai/gpt-5')).toBeInTheDocument();
    expect(screen.getByText('brand-1')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(apiService.getRunEffect).toHaveBeenCalledWith(
      'run-1',
      'brand-1',
      expect.any(AbortSignal),
    );

    fireEvent.click(screen.getByLabelText('Open Long content run thread'));
    expect(onOpenThread).toHaveBeenCalledWith('thread-1');

    fireEvent.click(screen.getByLabelText('Cancel Long content run'));
    await waitFor(() => {
      expect(apiService.cancelRunEffect).toHaveBeenCalledWith(
        'run-1',
        undefined,
        'brand-1',
      );
    });
    await screen.findByText('Long content run was cancelled.');
  });

  it('paginates historical runs and retries failed work', async () => {
    const firstRun = createRun({
      id: 'run-1',
      label: 'Failed campaign',
      status: 'FAILED',
    });
    const secondRun = createRun({
      id: 'run-2',
      label: 'Older campaign',
      status: 'COMPLETED',
    });
    const apiService = createApiService({
      getRunEffect: vi.fn((runId: string) =>
        Effect.succeed(runId === 'run-1' ? firstRun : secondRun),
      ),
      listRunsEffect: vi
        .fn()
        .mockImplementation(({ page }: { page: number }) =>
          Effect.succeed(
            page === 1
              ? createPage([firstRun], { pages: 2, total: 2 })
              : createPage([secondRun], { page: 2, pages: 2, total: 2 }),
          ),
        ),
    });

    render(<AgentWorkspaceRunSummary apiService={apiService as never} />);

    await screen.findByLabelText('Retry Failed campaign');
    fireEvent.click(screen.getByLabelText('Retry Failed campaign'));
    await waitFor(() => {
      expect(apiService.retryRunEffect).toHaveBeenCalledWith(
        'run-1',
        undefined,
        undefined,
      );
    });

    fireEvent.click(screen.getByLabelText('Next run page'));
    await screen.findByText('Older campaign');
    expect(apiService.listRunsEffect).toHaveBeenLastCalledWith(
      { brandId: undefined, limit: 10, page: 2 },
      expect.any(AbortSignal),
    );
  });

  it('shows list and detail failures without losing recovery controls', async () => {
    const run = createRun();
    const apiService = createApiService({
      getRunEffect: vi
        .fn()
        .mockReturnValueOnce(Effect.fail(new Error('Detail unavailable')))
        .mockReturnValueOnce(Effect.succeed(run)),
      listRunsEffect: vi
        .fn()
        .mockReturnValueOnce(Effect.fail(new Error('Runs unavailable')))
        .mockReturnValueOnce(Effect.succeed(createPage([run]))),
    });

    render(<AgentWorkspaceRunSummary apiService={apiService as never} />);

    await screen.findByText('Runs unavailable');
    fireEvent.click(screen.getByText('Retry'));

    await screen.findByText('Detail unavailable');
    fireEvent.click(screen.getByText('Retry detail'));
    await screen.findByText('web_search');
    expect(apiService.listRunsEffect).toHaveBeenCalledTimes(2);
    expect(apiService.getRunEffect).toHaveBeenCalledTimes(2);
  });

  it('keeps the loaded detail visible when a run action fails', async () => {
    const run = createRun();
    const apiService = createApiService({
      cancelRunEffect: vi.fn(() => Effect.fail('unavailable')),
      getRunEffect: vi.fn(() => Effect.succeed(run)),
      listRunsEffect: vi.fn(() => Effect.succeed(createPage([run]))),
    });

    render(<AgentWorkspaceRunSummary apiService={apiService as never} />);

    await screen.findByLabelText('Cancel Long content run');
    fireEvent.click(screen.getByLabelText('Cancel Long content run'));

    await screen.findByText('Failed to cancel agent run.');
    expect(screen.getByText('web_search')).toBeInTheDocument();
  });
});
