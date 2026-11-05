import {
  type AgentUiAction,
  type AgentUiActionOf,
  type AgentUiActionType,
  isAgentUiActionOf,
} from '@genfeedai/contracts/interfaces';

/** The first card of `type` in a tool result, or a test failure naming it. */
export function requireUiAction<T extends AgentUiActionType>(
  actions: readonly AgentUiAction[] | undefined,
  type: T,
): AgentUiActionOf<T> {
  const action = actions?.find(isAgentUiActionOf(type));
  if (!action) {
    throw new Error(`Expected a ${type} action`);
  }
  return action;
}
