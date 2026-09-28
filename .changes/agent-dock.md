packages: @genfeedai/agent, @genfeedai/contexts, @genfeedai/props

The agent conversation moves into a bottom dock on product routes (#5458).

- `@genfeedai/agent`:
  - `ConversationInspectorPanel` becomes `ConversationDockPanel`; its unused `onOpenConversation` prop is dropped.
  - The composer placement `'inspector'` becomes `'dock'`, as do the matching `AgentChatInput` density and `AgentChatEmptyState` variant.
  - `PersistedConversationComposerContentReference` gains an optional `kind` (`'ingredient' | 'post'`).
  - New `attachContentToConversationDraft` and `CONVERSATION_COMPOSER_DRAFT_UPDATED_EVENT` let a page attach a record to a mounted composer.
  - Content references are now sent as typed `artifactReferences`.
- `@genfeedai/contexts`: new `ui/agent-dock-context` (`AgentDockProvider`, `useAgentDock`, height bounds and storage key).
- `@genfeedai/props`: new `ui/agent-dock.props` (`AgentDockContextValue`, `AgentDockContentReference`, `AgentDockProps`).
