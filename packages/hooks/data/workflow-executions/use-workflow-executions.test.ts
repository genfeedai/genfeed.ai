import { useWorkflowExecutions } from '@hooks/data/workflow-executions/use-workflow-executions';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { listMock, statsMock, mockLoggerWarn } = vi.hoisted(() => ({
  listMock: vi.fn(),
  mockLoggerWarn: vi.fn(),
  statsMock: vi.fn(
    async (): Promise<unknown> => ({
      active: 0,
      completed: 45,
      completedToday: 2,
      failed: 4,
      failedToday: 1,
      total: 52,
      totalCredits: 80,
    }),
  ),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: vi.fn(),
    isLoaded: true,
    orgId: 'org-1',
    userId: 'user-1',
  }),
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: async () => 'token',
}));
vi.mock('@genfeedai/services/automation/workflow-executions.service', () => ({
  WorkflowExecutionsService: {
    getInstance: () => ({ list: listMock, getStats: statsMock }),
  },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { warn: mockLoggerWarn },
}));

describe('useWorkflowExecutions loading state', () => {
  it('distinguishes initial loading from background refresh and settles both flags', async () => {
    let resolveRequest: (rows: []) => void = () => {};
    listMock.mockImplementation(
      () =>
        new Promise<[]>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const { result } = renderHook(() => useWorkflowExecutions(), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isRefreshing).toBe(false);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    await act(async () => resolveRequest([]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      void result.current.refresh();
    });
    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.isLoading).toBe(false);
    await act(async () => resolveRequest([]));
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
  });
});

describe('useWorkflowExecutions organization scope', () => {
  it('clears executions and fetches again when collection organization changes', async () => {
    listMock.mockReset();
    listMock.mockResolvedValueOnce([
      { id: 'org-one-execution', status: 'COMPLETED', creditsUsed: 0 },
    ]);
    const { result, rerender } = renderHook(
      ({ organizationId }) =>
        useWorkflowExecutions({ strategyId: 'agent-1' }, { organizationId }),
      {
        initialProps: { organizationId: 'org-1' },
        wrapper: createQueryWrapper(),
      },
    );
    await waitFor(() =>
      expect(result.current.executions[0]?.id).toBe('org-one-execution'),
    );
    listMock.mockImplementation(() => new Promise(() => {}));
    rerender({ organizationId: 'org-2' });
    expect(result.current.executions).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it('does not fetch before an explicitly supplied organization scope resolves', () => {
    listMock.mockReset();
    renderHook(() => useWorkflowExecutions({}, { organizationId: '' }), {
      wrapper: createQueryWrapper(),
    });
    expect(listMock).not.toHaveBeenCalled();
  });
});

describe('useWorkflowExecutions summary', () => {
  it('uses all matching executions for counters and omits pagination from summary filters', async () => {
    listMock.mockResolvedValue([]);
    const { result } = renderHook(
      () =>
        useWorkflowExecutions({
          brandId: 'brand-1',
          strategyId: 'agent-1',
          limit: 5,
          offset: 20,
          sort: '-createdAt',
        }),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(result.current.stats.total).toBe(52));
    expect(result.current.executions).toEqual([]);
    expect(result.current.stats.completedToday).toBe(2);
    expect(statsMock).toHaveBeenLastCalledWith({
      brandId: 'brand-1',
      strategyId: 'agent-1',
      dayStart: expect.any(String),
      dayEnd: expect.any(String),
    });
  });

  it('keeps executions when the statistics payload is not a summary', async () => {
    listMock.mockReset();
    listMock.mockResolvedValue([
      { creditsUsed: 0, id: 'exec-1', status: 'COMPLETED' },
    ]);
    statsMock.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useWorkflowExecutions(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() =>
      expect(result.current.executions[0]?.id).toBe('exec-1'),
    );
    expect(result.current.isError).toBe(false);
    expect(result.current.stats).toEqual({
      active: 0,
      completed: 0,
      completedToday: 0,
      failed: 0,
      failedToday: 0,
      total: 0,
      totalCredits: 0,
    });
  });

  it('keeps executions and reports empty stats when getStats rejects', async () => {
    listMock.mockReset();
    mockLoggerWarn.mockClear();
    listMock.mockResolvedValue([
      { creditsUsed: 0, id: 'exec-rejected', status: 'COMPLETED' },
    ]);
    statsMock.mockRejectedValueOnce(new Error('stats endpoint unavailable'));
    const { result } = renderHook(() => useWorkflowExecutions(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() =>
      expect(result.current.executions[0]?.id).toBe('exec-rejected'),
    );
    expect(result.current.isError).toBe(false);
    expect(result.current.isStatsDegraded).toBe(true);
    expect(result.current.stats).toEqual({
      active: 0,
      completed: 0,
      completedToday: 0,
      failed: 0,
      failedToday: 0,
      total: 0,
      totalCredits: 0,
    });
    // A degraded stats response is not swallowed silently.
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('stats'),
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('derives active from PENDING/RUNNING executions when getStats rejects, instead of freezing at 0', async () => {
    listMock.mockReset();
    listMock.mockResolvedValue([
      { creditsUsed: 0, id: 'exec-running', status: 'RUNNING' },
      { creditsUsed: 0, id: 'exec-pending', status: 'PENDING' },
      { creditsUsed: 18, id: 'exec-done', status: 'COMPLETED' },
    ]);
    statsMock.mockRejectedValueOnce(new Error('stats endpoint unavailable'));
    const { result } = renderHook(() => useWorkflowExecutions(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.executions).toHaveLength(3));
    expect(result.current.isError).toBe(false);
    expect(result.current.isStatsDegraded).toBe(true);
    // Two active rows in the freshly fetched list, even though the stats
    // call itself failed and could not report a count.
    expect(result.current.stats.active).toBe(2);
  });

  it('falls back to the previously cached stats (not zeros) on a later rejected refetch, while still recomputing active from the fresh list', async () => {
    listMock.mockReset();
    listMock.mockResolvedValueOnce([
      { creditsUsed: 0, id: 'exec-1', status: 'COMPLETED' },
    ]);
    statsMock.mockResolvedValueOnce({
      active: 0,
      completed: 10,
      completedToday: 3,
      failed: 2,
      failedToday: 0,
      total: 12,
      totalCredits: 180,
    });
    const { result } = renderHook(() => useWorkflowExecutions(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.stats.total).toBe(12));
    expect(result.current.isStatsDegraded).toBe(false);

    listMock.mockResolvedValueOnce([
      { creditsUsed: 0, id: 'exec-1', status: 'COMPLETED' },
      { creditsUsed: 0, id: 'exec-2', status: 'RUNNING' },
    ]);
    statsMock.mockRejectedValueOnce(new Error('stats endpoint unavailable'));
    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.stats.active).toBe(1));
    expect(result.current.isStatsDegraded).toBe(true);
    // completed/total/etc. survive from the last good summary rather than
    // resetting to zero just because this poll's stats call failed.
    expect(result.current.stats.completed).toBe(10);
    expect(result.current.stats.total).toBe(12);
    expect(result.current.stats.totalCredits).toBe(180);
  });

  it('keeps executions and coerces stats when getStats resolves with null data', async () => {
    listMock.mockReset();
    listMock.mockResolvedValue([
      { creditsUsed: 0, id: 'exec-null-stats', status: 'COMPLETED' },
    ]);
    statsMock.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useWorkflowExecutions(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() =>
      expect(result.current.executions[0]?.id).toBe('exec-null-stats'),
    );
    expect(result.current.isError).toBe(false);
    expect(result.current.stats).toEqual({
      active: 0,
      completed: 0,
      completedToday: 0,
      failed: 0,
      failedToday: 0,
      total: 0,
      totalCredits: 0,
    });
  });

  it('does not throw from refetchInterval when stats are null and keeps polling paused', async () => {
    listMock.mockReset();
    listMock.mockResolvedValue([]);
    statsMock.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useWorkflowExecutions(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.stats.active).toBe(0);
  });

  it('keeps scheduling refetchInterval polling after getStats rejects while an execution stays active', async () => {
    vi.useFakeTimers();
    try {
      listMock.mockReset();
      listMock.mockResolvedValue([
        { creditsUsed: 0, id: 'exec-active', status: 'RUNNING' },
      ]);
      statsMock.mockRejectedValue(new Error('stats endpoint unavailable'));
      const { result } = renderHook(() => useWorkflowExecutions(), {
        wrapper: createQueryWrapper(),
      });

      await vi.waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
      expect(result.current.isError).toBe(false);
      expect(result.current.isStatsDegraded).toBe(true);
      expect(result.current.stats.active).toBe(1);

      // A rejected stats call must not zero out `active` and freeze
      // `refetchInterval`: this RUNNING execution has to keep polling.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(listMock).toHaveBeenCalledTimes(2);
      expect(result.current.isError).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
