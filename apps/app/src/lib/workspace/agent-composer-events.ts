/**
 * Workspace inspector tab events.
 *
 * Product surfaces stay on their route and drive the right-rail inspector:
 * - Context tab → entity detail / product panels
 * - Conversation tab → agent chat + composer (page context preserved)
 * - Files tab → brand library sources
 * - Browser tab → selected asset or page preview
 */
export const OPEN_CONTEXT_TAB_EVENT = 'workspace:open-context-tab';
export const OPEN_CONVERSATION_TAB_EVENT = 'workspace:open-conversation-tab';
export const OPEN_FILES_TAB_EVENT = 'workspace:open-files-tab';
export const OPEN_BROWSER_TAB_EVENT = 'workspace:open-browser-tab';

function dispatchWorkspaceTabEvent(eventName: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(eventName));
}

export function dispatchOpenContextTab(): void {
  dispatchWorkspaceTabEvent(OPEN_CONTEXT_TAB_EVENT);
}

export function dispatchOpenConversationTab(): void {
  dispatchWorkspaceTabEvent(OPEN_CONVERSATION_TAB_EVENT);
}

export function dispatchOpenFilesTab(): void {
  dispatchWorkspaceTabEvent(OPEN_FILES_TAB_EVENT);
}

export function dispatchOpenBrowserTab(): void {
  dispatchWorkspaceTabEvent(OPEN_BROWSER_TAB_EVENT);
}
