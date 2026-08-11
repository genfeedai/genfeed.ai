/**
 * Single source of truth for workspace inspector right-rail chrome copy.
 * Edit here — shell header, empty states, and expand control all read these.
 */
export const WORKSPACE_INSPECTOR_CHROME = {
  // Tab order in the rail is Context first, then Conversation — see
  // `UniversalWorkspaceShell`. These are labels only; order lives there.
  contextTab: 'Context',
  conversationTab: 'Conversation',
  /** Sole title when the rail is context-only (e.g. `/agent`). */
  title: 'Context',
  openFullConversation: 'Open full conversation',
  emptyAgentBody:
    'Context from the active conversation appears here as the agent works.',
  noConversationSelected: 'No conversation selected',
  conversationConnected: 'Conversation connected',
  surfaceSyncing: 'Synchronizing surface brand…',
  surfaceSyncFailed: 'Surface brand synchronization failed',
  mobileDrawerTitle: 'Context',
  mobileDrawerDescription:
    'Context and conversation for the active workspace surface.',
} as const;
