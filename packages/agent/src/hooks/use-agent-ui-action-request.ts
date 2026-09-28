import { getUiActionRunKey } from '@genfeedai/agent/hooks/agent-chat-container.ui-actions';
import type {
  AgentUiActionHandler,
  AgentUiActionOutcome,
} from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { useCallback, useState } from 'react';

/**
 * Where a card's ui-action stands. `awaiting`: the server accepted it but its
 * result has not arrived; the run keeps reconciling and settles the card.
 */
export type AgentUiActionRequestPhase =
  | 'idle'
  | 'running'
  | 'awaiting'
  | 'completed'
  | 'failed';

export interface AgentUiActionRequestOptions {
  /**
   * How a host that returns nothing (no outcome contract) is read: success
   * when true (the default), failure when false.
   */
  isVoidSuccess?: boolean;
}

export interface AgentUiActionRequest {
  /** The run's error once it failed after the card stopped waiting. */
  getError: (
    action: string,
    payload?: Record<string, unknown>,
  ) => string | null;
  getPhase: (
    action: string,
    payload?: Record<string, unknown>,
  ) => AgentUiActionRequestPhase;
  submit: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<AgentUiActionOutcome>;
}

/**
 * Run a card's ui-action and derive its phase from all three outcomes: the
 * handler's immediate `true` / `false` / `'pending'`, then — for a pending
 * one, or after a remount — the run recorded in `uiActionRuns`, which the
 * container keeps reconciling until it completes or fails.
 */
export function useAgentUiActionRequest(
  onUiAction: AgentUiActionHandler | undefined,
  options: AgentUiActionRequestOptions = {},
): AgentUiActionRequest {
  const { isVoidSuccess = true } = options;
  const threadId = useAgentChatStore((state) => state.activeThreadId) ?? '';
  const runs = useAgentChatStore((state) => state.uiActionRuns);
  const [phases, setPhases] = useState<
    Record<string, AgentUiActionRequestPhase>
  >({});

  const getPhase = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      const key = getUiActionRunKey(threadId, action, payload);
      const local = phases[key];
      if (local === 'running' || local === 'completed' || local === 'failed') {
        return local;
      }
      const run = runs[key];
      if (run?.status === 'completed') return 'completed';
      if (run?.status === 'failed') return 'failed';
      if (local === 'awaiting' || run?.status === 'pending') return 'awaiting';
      return 'idle';
    },
    [phases, runs, threadId],
  );

  const getError = useCallback(
    (action: string, payload?: Record<string, unknown>) =>
      runs[getUiActionRunKey(threadId, action, payload)]?.error ?? null,
    [runs, threadId],
  );

  const submit = useCallback(
    async (action: string, payload?: Record<string, unknown>) => {
      if (!onUiAction) {
        return false;
      }
      const key = getUiActionRunKey(threadId, action, payload);
      const setPhase = (phase: AgentUiActionRequestPhase) =>
        setPhases((current) => ({ ...current, [key]: phase }));
      setPhase('running');
      let outcome: AgentUiActionOutcome;
      try {
        const result = await onUiAction(action, payload);
        outcome =
          result === true || result === false || result === 'pending'
            ? result
            : isVoidSuccess;
      } catch {
        outcome = false;
      }
      setPhase(
        outcome === 'pending' ? 'awaiting' : outcome ? 'completed' : 'failed',
      );
      return outcome;
    },
    [isVoidSuccess, onUiAction, threadId],
  );

  return { getError, getPhase, submit };
}
