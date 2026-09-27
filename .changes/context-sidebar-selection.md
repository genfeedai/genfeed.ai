packages: @genfeedai/agent, @genfeedai/contexts, @genfeedai/pages, @genfeedai/props

Pages register the current selection with `ContextSidebarPanel`
(`@genfeedai/contexts/ui/context-sidebar-context`) and portal its detail into
the shell's context sidebar. `StudioGenerateInspector` is now the sidebar's
asset renderer: it drops `onClose` (the sidebar header owns close) and takes
`onRemix` and `onUseInPost`. `ResearchFindingInspector` takes the finding as a
prop. The agent draft store adds `buildConversationComposerDraftScopeKey` and
`attachContentToNewConversationDraft`.
