---
name: workspace-inspector-tabs-decisions
description: Layout persistence, pinned conversation, and catalog vs server prefs
type: project
---

# Decisions — workspace inspector tabs

**Why:** Keep the rail configurable without fighting ADR v3 (composer follows the conversation; inspector is a region, not a shell).

**How to apply:**

- **Approach chosen:** device-local tab layout + kind catalog. Rejected (1) more hardcoded tabs — not user-configurable. Rejected (2) server user-settings persistence — too much surface for chrome that already lives in localStorage.
- Conversation cannot be removed from the layout while it is the composer owner. Closing it would strand the prompt bar.
- Defaults apply only when nothing is persisted. A stored layout that omits Context is valid; pinned Conversation is merged back in if missing.
- Availability is page-aware (`conversation` only when the inspector hosts the thread). Files and Browser are available on every protected inspector host, including `/agent`, so operators can pin asset panes beside agent-owned context.
- Do not nest close controls inside `TabsTrigger`. Close is uncheck-in-menu plus an explicit close button for the active tab, sibling to the tablist.
- Do not nest a category `Tabs` inside the inspector `Tabs`. Files uses a button group for Images/Videos/GIFs so category changes cannot steal the rail tab value.
- Preview selection lives in `WorkspaceInspectorPreviewProvider` inside the shell so desktop rail and mobile drawer share the same file.
- Browser iframes only `http:`/`https:` URLs, without `allow-same-origin` + `allow-scripts` together. Library media uses `LibrarySourcePreview`, not an iframe.
---
