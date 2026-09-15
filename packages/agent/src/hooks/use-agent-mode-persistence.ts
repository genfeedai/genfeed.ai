import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadMode } from '@genfeedai/contracts';
import { UsersService } from '@services/organization/users.service';
import { useCallback, useEffect, useRef } from 'react';

export function useAgentModePersistence(apiService: AgentApiService) {
  const queue = useRef(Promise.resolve());
  const selection = useRef(0);
  const confirmed = useRef(new Map<string | null, AgentThreadMode>());
  const latestByThread = useRef(new Map<string | null, number>());
  const pendingByThread = useRef(new Map<string | null, number>());
  useEffect(() => {
    const controller = new AbortController();
    const initialSelection = selection.current;
    void (async () => {
      try {
        const token = await apiService.getToken();
        if (!token || controller.signal.aborted) return;
        const user = await UsersService.getInstance(token).findMe();
        const mode = user.settings.agentMode;
        if (
          controller.signal.aborted ||
          selection.current !== initialSelection ||
          !mode ||
          !Object.values(AgentThreadMode).includes(mode)
        )
          return;
        useAgentChatStore.setState((state) => ({
          savedAgentMode: mode,
          ...(!state.activeThreadId && !state.hasExplicitDraftAgentMode
            ? { draftAgentMode: mode }
            : {}),
        }));
      } catch {
        // An unknown default stays unhydrated; the server resolves it on send.
      }
    })();
    return () => controller.abort();
  }, [apiService]);

  return useCallback(
    (mode: AgentThreadMode) => {
      const state = useAgentChatStore.getState();
      const threadId = state.activeThreadId;
      const id = ++selection.current;
      latestByThread.current.set(threadId, id);
      if (!pendingByThread.current.get(threadId))
        confirmed.current.set(
          threadId,
          threadId
            ? (state.threads.find((thread) => thread.id === threadId)?.mode ??
                state.draftAgentMode)
            : (state.savedAgentMode ?? state.draftAgentMode),
        );
      pendingByThread.current.set(
        threadId,
        (pendingByThread.current.get(threadId) ?? 0) + 1,
      );
      useAgentChatStore.setState({
        draftAgentMode: mode,
        hasExplicitDraftAgentMode: true,
      });
      if (threadId) state.updateThread(threadId, { mode });
      const run = async () => {
        try {
          const token = await apiService.getToken();
          if (!token) throw new Error('Authentication required');
          await apiService.updateAgentMode(mode, threadId ?? undefined);
          confirmed.current.set(threadId, mode);
          useAgentChatStore.setState({ savedAgentMode: mode });
          if (threadId && latestByThread.current.get(threadId) === id)
            useAgentChatStore.getState().updateThread(threadId, { mode });
          if (
            selection.current === id &&
            useAgentChatStore.getState().activeThreadId === threadId
          ) {
            useAgentChatStore.setState({ draftAgentMode: mode });
          }
        } catch {
          const current = useAgentChatStore.getState();
          const rollback =
            (threadId
              ? confirmed.current.get(threadId)
              : current.savedAgentMode) ?? AgentThreadMode.MANUAL;
          if (threadId && latestByThread.current.get(threadId) === id)
            current.updateThread(threadId, { mode: rollback });
          if (selection.current === id && current.activeThreadId === threadId) {
            useAgentChatStore.setState({
              draftAgentMode: rollback,
              hasExplicitDraftAgentMode: false,
            });
            current.setError('Failed to update agent mode.');
          }
        } finally {
          pendingByThread.current.set(
            threadId,
            (pendingByThread.current.get(threadId) ?? 1) - 1,
          );
        }
      };
      queue.current = queue.current.then(run, run);
      return queue.current;
    },
    [apiService],
  );
}
