import { useCallback } from 'react';
import {
  useAsyncAction,
  useAsyncItem,
  useAsyncList,
} from '@/hooks/use-async-data';
import {
  type Approval,
  type ApprovalStatus,
  approvalsService,
  type ContentType,
} from '@/services/api/approvals.service';

export type { Approval, ApprovalStatus, ContentType };

export interface UseApprovalsOptions {
  status?: ApprovalStatus;
  contentType?: ContentType;
  page?: number;
  pageSize?: number;
}

export function useApprovals(options: UseApprovalsOptions = {}) {
  const result = useAsyncList<Approval, UseApprovalsOptions>(
    (token, opts) => approvalsService.findAll(token, opts),
    'approvals',
    { options },
  );

  return {
    approvals: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    pagination: result.pagination,
    refetch: result.refetch,
    refresh: result.refresh,
  };
}

export function useApproval(id: string | null) {
  const result = useAsyncItem<Approval>(
    (token, itemId) => approvalsService.findOne(token, itemId),
    id,
    'approval',
  );

  return {
    approval: result.data,
    error: result.error,
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}

export function useApprovalActions() {
  const { execute, isSubmitting, error, clearError } = useAsyncAction();

  const approve = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await execute(
        (token) => approvalsService.approve(token, id),
        'Failed to approve',
      );
      return result !== null;
    },
    [execute],
  );

  const reject = useCallback(
    async (id: string, reason: string): Promise<boolean> => {
      const result = await execute(
        (token) => approvalsService.reject(token, id, { reason }),
        'Failed to reject',
      );
      return result !== null;
    },
    [execute],
  );

  const bulkApprove = useCallback(
    async (
      ids: string[],
    ): Promise<{ approved: number; failed: number } | null> => {
      const result = await execute(
        (token) => approvalsService.bulkApprove(token, ids),
        'Failed to bulk approve',
      );
      return result?.data || null;
    },
    [execute],
  );

  return {
    approve,
    bulkApprove,
    clearError,
    error,
    isSubmitting,
    reject,
  };
}

interface CountData {
  count: number;
}

export function usePendingApprovalCount() {
  const result = useAsyncItem<CountData>(
    async (token) => {
      const response = await approvalsService.getCount(token, 'pending');
      return { data: response.data };
    },
    'pending',
    'pendingApprovalCount',
  );

  return {
    count: result.data?.count ?? 0,
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}
