import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';

/**
 * Resolves the user prompt to re-send for a retry.
 * - User message → its own content
 * - Assistant message → nearest previous user prompt
 */
export function resolveRetryPrompt(
  messages: AgentChatMessage[],
  messageId: string,
): string | null {
  const messageIndex = messages.findIndex(
    (message) => message.id === messageId,
  );

  if (messageIndex < 0) {
    return null;
  }

  const target = messages[messageIndex];
  if (target?.role === 'user') {
    const content = target.content.trim();
    return content.length > 0 ? content : null;
  }

  if (messageIndex === 0) {
    return null;
  }

  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user') {
      const content = message.content.trim();
      return content.length > 0 ? content : null;
    }
  }

  return null;
}
