'use client';

import type { AgentThreadShare } from '@genfeedai/agent';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { viewerKeyPart } from '@hooks/auth/use-authed-query/use-authed-query';
import { useResetOnChange } from '@hooks/utils/use-reset-on-change/use-reset-on-change';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  AgentThreadAccess,
  AgentThreadsPanelApi,
} from '@/components/workspace-shell/props/agent-threads-panel.props';

const NO_SHARES: readonly AgentThreadShare[] = [];
const SHARES_QUERY_KEY = 'agent-thread-shares';

/**
 * Who one thread is shared with, as the server holds it. A thread whose shares
 * are not confirmed reads `loading`, `failed` or `unverified`, never as an empty
 * (private) list, and another thread's shares are never carried over.
 * `isEnabled: false` is for viewers who cannot manage shares; they read no list.
 */
export function useAgentThreadShares(
  apiService: Pick<AgentThreadsPanelApi, 'getThreadShares'>,
  threadId: string,
  isEnabled: boolean,
): AgentThreadAccess & {
  confirm: (shares: readonly AgentThreadShare[], forThreadId: string) => void;
  markUnverified: (forThreadId: string) => void;
  retry: () => void;
} {
  const queryClient = useQueryClient();
  const { orgId, userId } = useAuthIdentity();
  const viewerKey = viewerKeyPart(userId, orgId);
  const queryKey = useMemo(
    () => [SHARES_QUERY_KEY, viewerKey, threadId],
    [viewerKey, threadId],
  );
  // Shares are never served from a previous visit: an unconfirmed list must
  // read `loading`, not the last list this viewer happened to see.
  const query = useQuery<readonly AgentThreadShare[], Error>({
    enabled: isEnabled,
    gcTime: 0,
    queryFn: ({ signal }) => apiService.getThreadShares(threadId, signal),
    queryKey,
    retry: false,
    staleTime: 0,
  });
  const [unverifiedThreadId, setUnverifiedThreadId] = useState<string | null>(
    null,
  );
  useResetOnChange([threadId], () => setUnverifiedThreadId(null));
  const openThreadId = useRef(threadId);
  openThreadId.current = threadId;

  // A change that finishes after the open thread moved on is not this thread's.
  const confirm = useCallback(
    (shares: readonly AgentThreadShare[], forThreadId: string) => {
      if (forThreadId === openThreadId.current) {
        queryClient.setQueryData(
          [SHARES_QUERY_KEY, viewerKey, forThreadId],
          shares,
        );
        setUnverifiedThreadId(null);
      }
    },
    [queryClient, viewerKey],
  );
  const markUnverified = useCallback((forThreadId: string) => {
    if (forThreadId === openThreadId.current) {
      setUnverifiedThreadId(forThreadId);
    }
  }, []);
  const { refetch } = query;
  const retry = useCallback(() => {
    setUnverifiedThreadId(null);
    void refetch();
  }, [refetch]);

  if (!isEnabled) {
    return {
      confirm,
      markUnverified,
      retry,
      shares: NO_SHARES,
      status: 'ready',
    };
  }
  if (unverifiedThreadId === threadId) {
    return {
      confirm,
      markUnverified,
      retry,
      shares: NO_SHARES,
      status: 'unverified',
    };
  }
  if (query.data !== undefined && !query.isFetching) {
    return {
      confirm,
      markUnverified,
      retry,
      shares: query.data,
      status: 'ready',
    };
  }
  return {
    confirm,
    markUnverified,
    retry,
    shares: NO_SHARES,
    status: query.isError ? 'failed' : 'loading',
  };
}
