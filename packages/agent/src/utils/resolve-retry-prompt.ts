import type { AgentChatMessage } from '@cloud/agent/models/agent-chat.model';

/**
 * Resolves the nearest previous user prompt for a given assistant message.
 */
export function resolveRetryPrompt(
  messages: AgentChatMessage[],
  assistantMessageId: string,
): string | null {
  const assistantIndex = messages.findIndex(
    (message) => message.id === assistantMessageId,
  );

  if (assistantIndex <= 0) {
    return null;
  }

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user') {
      const content = message.content.trim();
      return content.length > 0 ? content : null;
    }
  }

  return null;
}
