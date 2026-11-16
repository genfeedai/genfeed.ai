'use client';

import type { AgentThreadShare } from '@genfeedai/agent';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentThreadAccess,
  AgentThreadsPanelApi,
} from '@/components/workspace-shell/props/agent-threads-panel.props';

interface OwnedAccess extends AgentThreadAccess {
  threadId: string;
}

const NO_SHARES: readonly AgentThreadShare[] = [];

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
  const [owned, setOwned] = useState<OwnedAccess>({
    shares: NO_SHARES,
    status: 'loading',
    threadId,
  });
  const [attempt, setAttempt] = useState(0);
  const openThreadId = useRef(threadId);
  openThreadId.current = threadId;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the lookup on retry.
  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    const controller = new AbortController();
    setOwned({ shares: NO_SHARES, status: 'loading', threadId });
    apiService
      .getThreadShares(threadId, controller.signal)
      .then((shares) => {
        if (!controller.signal.aborted) {
          setOwned({ shares, status: 'ready', threadId });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOwned({ shares: NO_SHARES, status: 'failed', threadId });
        }
      });
    return () => controller.abort();
  }, [apiService, attempt, isEnabled, threadId]);

  // A change that finishes after the open thread moved on is not this thread's.
  const confirm = useCallback(
    (shares: readonly AgentThreadShare[], forThreadId: string) => {
      if (forThreadId === openThreadId.current) {
        setOwned({ shares, status: 'ready', threadId: forThreadId });
      }
    },
    [],
  );
  const markUnverified = useCallback((forThreadId: string) => {
    if (forThreadId === openThreadId.current) {
      setOwned({
        shares: NO_SHARES,
        status: 'unverified',
        threadId: forThreadId,
      });
    }
  }, []);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  if (!isEnabled) {
    return {
      confirm,
      markUnverified,
      retry,
      shares: NO_SHARES,
      status: 'ready',
    };
  }
  // Never read another thread's shares, even for the render before the effect runs.
  const current: AgentThreadAccess =
    owned.threadId === threadId
      ? owned
      : { shares: NO_SHARES, status: 'loading' };
  return { confirm, markUnverified, retry, ...current };
}
