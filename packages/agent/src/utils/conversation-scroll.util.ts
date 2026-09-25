/**
 * Conversation transcript scrolling.
 *
 * The docked composer overlays the scrollport. Pinning `scrollTop` to
 * `scrollHeight` includes the measured bottom padding so the latest turn sits
 * above the prompt bar. `scrollIntoView` on the end sentinel stops at the
 * overlay and can also scroll an ancestor.
 */

export function pinConversationScrollToBottom(
  container: HTMLElement | null,
  behavior: ScrollBehavior = 'auto',
): void {
  if (!container) {
    return;
  }

  if (behavior === 'smooth' && typeof container.scrollTo === 'function') {
    container.scrollTo({ behavior, top: container.scrollHeight });
    return;
  }

  container.scrollTop = container.scrollHeight;
}

export function conversationMessagesBelongToThread(
  messages: readonly { threadId?: string }[],
  threadId: string | null,
): boolean {
  if (!threadId || messages.length === 0) {
    return false;
  }

  return messages[messages.length - 1]?.threadId === threadId;
}
