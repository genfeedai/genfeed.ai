import type { OpenRouterMessage } from '@api/services/integrations/openrouter/dto/openrouter.dto';

/**
 * The text of the newest user message in the turn. A message sent with
 * attachments is stored as content parts rather than a string, so the text
 * parts are joined; image parts carry no words. The search never walks past
 * the newest user message: an attachment-only message must not hand the
 * caller an older message's words as the operator's current instruction.
 */
export function readLatestOperatorMessage(
  messages: readonly OpenRouterMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      continue;
    }
    if (typeof message.content === 'string') {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      const text = message.content
        .flatMap((part) =>
          part.type === 'text' && typeof part.text === 'string'
            ? [part.text]
            : [],
        )
        .join('\n');
      return text.length > 0 ? text : null;
    }
    return null;
  }
  return null;
}
