import { findUiActionState } from '@genfeedai/agent/hooks/agent-chat-container.ui-actions';
import type {
  AgentUiActionHandler,
  AgentUiActionOutcome,
} from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  getAgentUiActionSourceId,
  getAgentUiActionStateKey,
} from '@genfeedai/contracts/interfaces';
import { useCallback, useState } from 'react';

/**
 * Where a card's ui-action stands. `running`: the request is in flight until
 * its ack. `awaiting`: the server accepted it and its run has not settled.
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
  /** The run's error once it failed. */
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
 * A card's ui-action phase, derived from the thread's ui-action state for the
 * source it acts on — the same after a remount, a thread switch or a reload.
 * The only local state is the request itself: in flight until its ack, and the
 * outcome of a request that never started a run (rejected, or handled on the
 * client).
 */
export function useAgentUiActionRequest(
  onUiAction: AgentUiActionHandler | undefined,
  options: AgentUiActionRequestOptions = {},
): AgentUiActionRequest {
  const { isVoidSuccess = true } = options;
  const threadId = useAgentChatStore((state) => state.activeThreadId) ?? '';
  const states = useAgentChatStore((state) =>
    threadId ? state.uiActionStatesByThread[threadId] : undefined,
  );
  const [requests, setRequests] = useState<
    Record<string, 'running' | 'completed' | 'failed'>
  >({});

  const getPhase = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      const key = getAgentUiActionStateKey(
        action,
        getAgentUiActionSourceId(payload),
      );
      const request = requests[`${threadId}:${key}`];
      if (request === 'running') {
        return 'running';
      }
      switch (findUiActionState(states, action, payload)?.status) {
        case 'pending':
          return 'awaiting';
        case 'completed':
          return 'completed';
        case 'failed':
        case 'cancelled':
          return 'failed';
        default:
          return request ?? 'idle';
      }
    },
    [requests, states, threadId],
  );

  const getError = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      const state = findUiActionState(states, action, payload);
      return state?.status === 'failed' || state?.status === 'cancelled'
        ? (state.error ?? null)
        : null;
    },
    [states],
  );

  const submit = useCallback(
    async (action: string, payload?: Record<string, unknown>) => {
      if (!onUiAction) {
        return false;
      }
      const key = `${threadId}:${getAgentUiActionStateKey(
        action,
        getAgentUiActionSourceId(payload),
      )}`;
      setRequests((current) => ({ ...current, [key]: 'running' }));
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
      setRequests((current) => {
        const { [key]: _settled, ...rest } = current;
        // An acked run is tracked by the thread; only a request that started
        // no run keeps its own outcome.
        return outcome === 'pending'
          ? rest
          : { ...rest, [key]: outcome ? 'completed' : 'failed' };
      });
      return outcome;
    },
    [isVoidSuccess, onUiAction, threadId],
  );

  return { getError, getPhase, submit };
}
