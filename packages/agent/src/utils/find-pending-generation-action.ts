import type {
  AgentChatMessage,
  AgentUiAction,
} from '@genfeedai/agent/models/agent-chat.model';
import type { ThreadGenerationType } from '@genfeedai/agent/utils/thread-generation-type';

function readResolvedGenerationActionId(action: AgentUiAction): string | null {
  const sourceActionId = action.data?.sourceGenerationActionId;
  return typeof sourceActionId === 'string' && sourceActionId.trim()
    ? sourceActionId
    : null;
}

/**
 * Returns the newest generation request that has not produced a persisted
 * output action yet. Generation configuration is composer input; completed
 * media stays in the conversation and Outputs panel.
 */
export function findPendingGenerationAction(
  messages: AgentChatMessage[],
  threadId?: string | null,
  generationType?: ThreadGenerationType | null,
): AgentUiAction | null {
  const resolvedActionIds = new Set<string>();

  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const candidate = messages[messageIndex];
    if (threadId && candidate?.threadId !== threadId) {
      continue;
    }

    const actions = candidate?.metadata?.uiActions ?? [];

    for (
      let actionIndex = actions.length - 1;
      actionIndex >= 0;
      actionIndex -= 1
    ) {
      const action = actions[actionIndex];
      const resolvedActionId = readResolvedGenerationActionId(action);

      if (resolvedActionId) {
        resolvedActionIds.add(resolvedActionId);
        continue;
      }

      if (
        action.type === 'generation_action_card' &&
        !resolvedActionIds.has(action.id) &&
        (generationType == null || action.generationType === generationType)
      ) {
        return action;
      }
    }
  }

  return null;
}
