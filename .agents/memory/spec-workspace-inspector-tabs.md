---
name: workspace-inspector-tabs
description: User-configurable right-rail tabs for conversation and page-context assets
type: project
---

# Workspace inspector tabs

**Why:** The inspector rail is the conversation region on product routes (ADR conversation-shell v3.2). Operators need more than a fixed Context/Conversation pair — they should open, close, and persist the asset panes that match the current page (library files, previews, context, thread).

**How to apply:**

- The rail is a **user-owned tab layout**, not a hardcoded two-tab switch. Default on product routes remains Context then Conversation so existing composer events keep working.
- A `+` menu lists every **available** pane kind for this page. Checking a kind opens it and focuses it; unchecking closes it when allowed.
- Conversation stays **pinned** while the inspector owns the composer (product routes, off overlay). The last remaining tab cannot be closed.
- Layout is a **device-local chrome preference** (`localStorage`), same tier as inspector open/closed. Not a server user setting in this slice.
- Pane kinds are a catalog (`context`, `conversation`, `files`, `browser`). New kinds register in the catalog; they do not grow ad-hoc conditionals in the chrome.
- Files is the brand library picker in the rail (`useLibraryPicker`). Selecting a source stores it as the inspector preview and opens Browser.
- Browser shows the selected library media, else a sandboxed http(s) page URL, else an empty state that opens Files.
- `OPEN_FILES_TAB_EVENT` / `OPEN_BROWSER_TAB_EVENT` mirror the Context/Conversation tab events.
- Copy goes through `common.workspaceInspector` (next-intl). No module-level COPY strings for tab chrome.
- Tab chrome is a flush editor strip (`data-variant="underline"`) — no pill-in-a-box `TabsList` track.
---
