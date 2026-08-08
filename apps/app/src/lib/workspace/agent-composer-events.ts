/**
 * Workspace inspector tab events.
 *
 * Product surfaces stay on their route and drive the right-rail inspector:
 * - Context tab → entity detail / product panels
 * - Conversation tab → agent chat + composer (page context preserved)
 */
export const OPEN_CONTEXT_TAB_EVENT = 'workspace:open-context-tab';
export const OPEN_CONVERSATION_TAB_EVENT = 'workspace:open-conversation-tab';

export function dispatchOpenContextTab(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(OPEN_CONTEXT_TAB_EVENT));
}

export function dispatchOpenConversationTab(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(OPEN_CONVERSATION_TAB_EVENT));
}
