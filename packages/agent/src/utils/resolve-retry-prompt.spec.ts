import type { AgentChatMessage } from '@cloud/agent/models/agent-chat.model';
import { resolveRetryPrompt } from '@cloud/agent/utils/resolve-retry-prompt';
import { describe, expect, it } from 'vitest';

function createMessage(
  id: string,
  role: AgentChatMessage['role'],
  content: string,
): AgentChatMessage {
  return {
    content,
    createdAt: '2026-03-03T00:00:00.000Z',
    id,
    role,
    threadId: 'thread-1',
  };
}

describe('resolveRetryPrompt', () => {
  it('returns the nearest prior user message for an assistant message', () => {
    const messages: AgentChatMessage[] = [
      createMessage('m-1', 'user', 'first prompt'),
      createMessage('m-2', 'assistant', 'first answer'),
      createMessage('m-3', 'user', 'second prompt'),
      createMessage('m-4', 'assistant', 'second answer'),
    ];

    expect(resolveRetryPrompt(messages, 'm-4')).toBe('second prompt');
  });

  it('ignores non-user messages while scanning backwards', () => {
    const messages: AgentChatMessage[] = [
      createMessage('m-1', 'user', 'prompt'),
      createMessage('m-2', 'assistant', 'answer'),
      createMessage('m-3', 'system', 'note'),
      createMessage('m-4', 'assistant', 'another answer'),
    ];

    expect(resolveRetryPrompt(messages, 'm-4')).toBe('prompt');
  });

  it('returns null when there is no prior user message', () => {
    const messages: AgentChatMessage[] = [
      createMessage('m-1', 'assistant', 'answer'),
      createMessage('m-2', 'assistant', 'another answer'),
    ];

    expect(resolveRetryPrompt(messages, 'm-2')).toBeNull();
  });

  it('returns null when the target assistant message cannot be found', () => {
    const messages: AgentChatMessage[] = [
      createMessage('m-1', 'user', 'prompt'),
      createMessage('m-2', 'assistant', 'answer'),
    ];

    expect(resolveRetryPrompt(messages, 'missing-id')).toBeNull();
  });
});
