import { isThreadGoneError } from '@genfeedai/agent/components/agent-thread-list.helpers';
import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { getRequestOrganizationHeaders } from '@services/core/interceptor.service';
import { useCallback, useEffect, useRef, useState } from 'react';

export type AgentThreadUpdateFailure = 'missing-thread' | 'failed';

type ThreadUpdateOptions = {
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
};

/** Keep failed updates local to the conversation that issued them. Never retry. */
export function useAgentThreadUpdate() {
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const [failure, setFailure] = useState<AgentThreadUpdateFailure | null>(null);
  const pending = useRef(new Map<string, AbortController>());
  const organizationKey = JSON.stringify(getRequestOrganizationHeaders());
  const scopeKey = JSON.stringify([activeThreadId, organizationKey]);
  const scopeRef = useRef(scopeKey);

  useEffect(() => {
    if (scopeRef.current !== scopeKey) {
      scopeRef.current = scopeKey;
      setFailure(null);
    }
    return () => {
      for (const controller of pending.current.values()) controller.abort();
      pending.current.clear();
    };
  }, [scopeKey]);

  const runUpdate = useCallback(
    async (
      threadId: string,
      request: (signal: AbortSignal) => Promise<AgentThread>,
      options?: ThreadUpdateOptions,
    ): Promise<AgentThread | null> => {
      pending.current.get(threadId)?.abort();
      const controller = new AbortController();
      pending.current.set(threadId, controller);
      const requestSignal = options?.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
      const organization = JSON.stringify(getRequestOrganizationHeaders());
      const selectedThread = useAgentChatStore.getState().activeThreadId;
      const isCurrent = () =>
        !requestSignal.aborted &&
        useAgentChatStore.getState().activeThreadId === selectedThread &&
        JSON.stringify(getRequestOrganizationHeaders()) === organization;
      setFailure(null);
      try {
        const updated = await request(requestSignal);
        return isCurrent() ? updated : null;
      } catch (error) {
        if (isCurrent()) {
          const isMissing = isThreadGoneError(error);
          setFailure(isMissing ? 'missing-thread' : 'failed');
          options?.onError?.(error);
        }
        return null;
      } finally {
        if (pending.current.get(threadId) === controller) {
          pending.current.delete(threadId);
        }
      }
    },
    [],
  );

  return { failure, runUpdate };
}
