import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/auth-context', () => ({
  useMobileAuth: vi.fn(() => ({
    getToken: vi.fn().mockResolvedValue('test-token'),
    isLoaded: true,
    isSignedIn: true,
    refreshSession: vi.fn(),
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
    user: null,
  })),
}));

vi.mock('@/services/api/approvals.service', () => ({
  approvalsService: {
    approve: vi.fn(),
    bulkApprove: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    getCount: vi.fn(),
    reject: vi.fn(),
  },
}));

import { useMobileAuth } from '@/contexts/auth-context';
import {
  useApproval,
  useApprovalActions,
  useApprovals,
  usePendingApprovalCount,
} from '@/hooks/use-approvals';
import { approvalsService } from '@/services/api/approvals.service';

describe('useApprovals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('loads pending approvals', async () => {
    vi.mocked(approvalsService.findAll).mockResolvedValue({
      data: [{ id: 'appr-1', type: 'approval' }],
    } as never);

    const { result } = renderHook(() => useApprovals({ status: 'pending' }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.approvals).toEqual([
      { id: 'appr-1', type: 'approval' },
    ]);
  });
});

describe('useApproval and usePendingApprovalCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('loads one approval and the pending count', async () => {
    vi.mocked(approvalsService.findOne).mockResolvedValue({
      data: { id: 'appr-1', type: 'approval' },
    } as never);
    vi.mocked(approvalsService.getCount).mockResolvedValue({
      data: { count: 4 },
    });

    const approval = renderHook(() => useApproval('appr-1'));
    const count = renderHook(() => usePendingApprovalCount());

    await waitFor(() => {
      expect(approval.result.current.isLoading).toBe(false);
      expect(count.result.current.isLoading).toBe(false);
    });

    expect(approval.result.current.approval?.id).toBe('appr-1');
    expect(count.result.current.count).toBe(4);
  });
});

describe('useApprovalActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('approves, rejects, and bulk-approves', async () => {
    vi.mocked(approvalsService.approve).mockResolvedValue({
      data: { id: 'appr-1' },
    } as never);
    vi.mocked(approvalsService.reject).mockResolvedValue({
      data: { id: 'appr-1' },
    } as never);
    vi.mocked(approvalsService.bulkApprove).mockResolvedValue({
      data: { approved: 2, failed: 0 },
    });

    const { result } = renderHook(() => useApprovalActions());

    await act(async () => {
      await expect(result.current.approve('appr-1')).resolves.toBe(true);
      await expect(result.current.reject('appr-1', 'off brand')).resolves.toBe(
        true,
      );
      await expect(result.current.bulkApprove(['a', 'b'])).resolves.toEqual({
        approved: 2,
        failed: 0,
      });
    });
  });
});
