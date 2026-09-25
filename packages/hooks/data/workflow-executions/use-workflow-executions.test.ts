import { useWorkflowExecutions } from '@hooks/data/workflow-executions/use-workflow-executions';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { listMock, statsMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
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
});
