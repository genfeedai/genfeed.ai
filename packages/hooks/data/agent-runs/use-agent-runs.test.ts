import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.fn();
const mockGetStats = vi.fn();
const mockCancel = vi.fn();
const mockGetActive = vi.fn();
const mockResolveAuthToken = vi.fn();

vi.mock('@genfeedai/services/ai/agent-runs.service', () => ({
  AgentRunsService: {
    getInstance: vi.fn(() => ({
      cancel: mockCancel,
      getActive: mockGetActive,
      getStats: mockGetStats,
      list: mockList,
    })),
  },
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => mockResolveAuthToken(...args),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: vi.fn(),
    orgId: 'org-1',
    userId: 'user-1',
  }),
}));

import { useActiveAgentRuns } from './use-active-agent-runs';
import { useAgentRuns } from './use-agent-runs';

const RUN = { id: 'run-1', status: 'RUNNING' };
const STATS = { totalRuns: 3 };

describe('useAgentRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAuthToken.mockResolvedValue('token-abc');
    mockList.mockResolvedValue([RUN]);
    mockGetStats.mockResolvedValue(STATS);
    mockCancel.mockResolvedValue(undefined);
  });

  it('fetches runs and stats', async () => {
    const { result } = renderHook(() => useAgentRuns({ page: 2, q: 'query' }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runs).toEqual([RUN]);
    });

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, q: 'query' }),
    );
    expect(mockGetStats).toHaveBeenCalledWith({ timeRange: undefined });
    expect(result.current.stats).toEqual(STATS);
  });

  it('returns empty runs without an auth token', async () => {
    mockResolveAuthToken.mockResolvedValue(null);

    const { result } = renderHook(() => useAgentRuns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockList).not.toHaveBeenCalled();
    expect(result.current.runs).toEqual([]);
  });

  it('seeds initial runs and stats', () => {
    const { result } = renderHook(
      () =>
        useAgentRuns({
          initialRuns: [RUN],
          initialStats: STATS,
          revalidateOnMount: false,
        }),
      { wrapper: createQueryWrapper() },
    );

    expect(result.current.runs).toEqual([RUN]);
    expect(result.current.stats).toEqual(STATS);
  });

  it('cancels a run and refetches', async () => {
    const { result } = renderHook(() => useAgentRuns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runs).toEqual([RUN]);
    });

    await act(async () => {
      await result.current.cancelRun('run-1');
    });

    expect(mockCancel).toHaveBeenCalledWith('run-1');
  });

  it('skips cancel without an auth token', async () => {
    const { result } = renderHook(() => useAgentRuns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runs).toEqual([RUN]);
    });

    mockResolveAuthToken.mockResolvedValue(null);

    await act(async () => {
      await result.current.cancelRun('run-1');
    });

    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('refresh refetches the list', async () => {
    const { result } = renderHook(() => useAgentRuns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.runs).toEqual([RUN]);
    });

    mockList.mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockList).toHaveBeenCalled();
  });
});

describe('useActiveAgentRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAuthToken.mockResolvedValue('token-abc');
    mockGetActive.mockResolvedValue([RUN]);
  });

  it('fetches active runs', async () => {
    const { result } = renderHook(() => useActiveAgentRuns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.activeRuns).toEqual([RUN]);
    });

    expect(mockGetActive).toHaveBeenCalled();
  });

  it('returns empty active runs without an auth token', async () => {
    mockResolveAuthToken.mockResolvedValue(null);

    const { result } = renderHook(() => useActiveAgentRuns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeRuns).toEqual([]);
  });

  it('seeds initial active runs without refetching', () => {
    const { result } = renderHook(
      () =>
        useActiveAgentRuns({
          initialActiveRuns: [RUN],
          revalidateOnMount: false,
        }),
      { wrapper: createQueryWrapper() },
    );

    expect(result.current.activeRuns).toEqual([RUN]);
  });

  it('polls while there are active runs and stops on unmount', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    try {
      const { result, unmount } = renderHook(() => useActiveAgentRuns(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activeRuns).toEqual([RUN]);
      });

      await waitFor(() => {
        expect(setIntervalSpy).toHaveBeenCalledWith(
          expect.any(Function),
          5_000,
        );
      });

      const pollCall = setIntervalSpy.mock.calls.find(
        (call) => call[1] === 5_000,
      );
      if (!pollCall) {
        throw new Error('Expected a 5s polling interval to be registered');
      }
      const poll = pollCall[0] as () => void;
      const intervalId = setIntervalSpy.mock.results.at(-1)?.value;
      mockGetActive.mockClear();

      await act(async () => {
        poll();
      });

      await waitFor(() => {
        expect(mockGetActive).toHaveBeenCalled();
      });

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
    } finally {
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });

  it('refresh refetches the active runs', async () => {
    const { result } = renderHook(() => useActiveAgentRuns(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.activeRuns).toEqual([RUN]);
    });

    mockGetActive.mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockGetActive).toHaveBeenCalled();
  });
});
