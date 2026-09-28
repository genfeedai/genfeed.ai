packages: @genfeedai/props, @genfeedai/agent

The legacy workspace inspector is gone; the context sidebar is the only right
column.

- `@genfeedai/props`: `ContextSidebarSelectionKind` gains `thread` (an Agent
  thread's outputs). `StudioWorkspaceSurfaceAdapterProps` and
  `StudioWorkspaceInspectorProps` are removed with the unmounted Studio
  adapter. `MessagesSurfaceAdapterParams` keeps only `references`, and
  `MessagesSurfaceInspectorProps` is removed.
- `@genfeedai/agent`: `ConversationInspectorShellProvider`,
  `useConversationInspectorShell` and `ConversationInspectorShellContextValue`
  are removed. `AgentFullPage` registers the thread's outputs with the context
  sidebar once there are any; Setup and thread context no longer paint a
  desktop side panel.
