import {
  conversationMessagesBelongToThread,
  pinConversationScrollToBottom,
} from '@genfeedai/agent/utils/conversation-scroll.util';
import { describe, expect, it, vi } from 'vitest';

describe('pinConversationScrollToBottom', () => {
  it('pins scrollTop to the full scrollHeight so padding below the sentinel is included', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 2400,
    });

    pinConversationScrollToBottom(container);

    expect(container.scrollTop).toBe(2400);
  });

  it('uses smooth scrollTo when requested', () => {
    const container = document.createElement('div');
    const scrollTo = vi.fn();
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 1800,
    });
    container.scrollTo = scrollTo;

    pinConversationScrollToBottom(container, 'smooth');

    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 1800 });
  });

  it('is a no-op without a container', () => {
    expect(() => pinConversationScrollToBottom(null)).not.toThrow();
  });
});

describe('conversationMessagesBelongToThread', () => {
  it('is false until the latest message belongs to the active thread', () => {
    expect(
      conversationMessagesBelongToThread(
        [{ threadId: 'thread-a' }],
        'thread-b',
      ),
    ).toBe(false);
    expect(conversationMessagesBelongToThread([], 'thread-b')).toBe(false);
    expect(
      conversationMessagesBelongToThread([{ threadId: 'thread-b' }], null),
    ).toBe(false);
  });

  it('is true when the latest message is on the active thread', () => {
    expect(
      conversationMessagesBelongToThread(
        [{ threadId: 'thread-a' }, { threadId: 'thread-b' }],
        'thread-b',
      ),
    ).toBe(true);
  });
});
