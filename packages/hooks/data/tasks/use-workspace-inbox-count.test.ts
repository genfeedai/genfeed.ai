import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { useQueryClient } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.fn();
const mockResolveAuthToken = vi.fn();

vi.mock(
  '@genfeedai/services/management/tasks.service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@genfeedai/services/management/tasks.service')
      >();

    return {
      ...actual,
      TasksService: {
        getInstance: vi.fn(() => ({
          list: mockList,
        })),
      },
    };
  },
);

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => mockResolveAuthToken(...args),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: vi.fn(),
    orgId: 'organization-1',
    userId: 'user-1',
  }),
}));

import { useWorkspaceInboxCount } from './use-workspace-inbox-count';

describe('useWorkspaceInboxCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAuthToken.mockResolvedValue('token-abc');
  });

  it('counts only actionable tasks in the workspace inbox queue', async () => {
    mockList.mockResolvedValue([
      { id: 'pending', reviewState: 'pending_approval', status: 'done' },
      { id: 'active', reviewState: 'none', status: 'in_progress' },
      { id: 'complete', reviewState: 'approved', status: 'done' },
      {
        dismissedAt: '2026-08-31T08:00:00.000Z',
        id: 'dismissed',
        reviewState: 'pending_approval',
        status: 'in_review',
      },
    ]);

    const { result } = renderHook(() => useWorkspaceInboxCount(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBe(2);
    });

    expect(mockList).toHaveBeenCalledWith({});
  });

  it('refreshes the shared inbox query every minute with a 30-second stale time', () => {
    mockList.mockResolvedValue([]);
    const { result } = renderHook(
      () => {
        useWorkspaceInboxCount();
        return useQueryClient();
      },
      { wrapper: createQueryWrapper() },
    );

    expect(
      result.current.getQueryCache().find({
        queryKey: ['workspace-inbox-tasks', 'user-1', 'organization-1'],
        exact: true,
      })?.options,
    ).toEqual(
      expect.objectContaining({
        refetchInterval: 60_000,
        staleTime: 30_000,
      }),
    );
  });

  it('returns zero without an auth token', async () => {
    mockResolveAuthToken.mockResolvedValue(null);

    const { result } = renderHook(() => useWorkspaceInboxCount(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(mockResolveAuthToken).toHaveBeenCalledTimes(1);
    });

    expect(result.current).toBe(0);
    expect(mockList).not.toHaveBeenCalled();
  });
});
