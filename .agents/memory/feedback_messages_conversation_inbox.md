---
name: Messages is the omnichannel conversation inbox
description: Messages uses the workspace nav for social conversations, prioritizes account connection when disconnected, and removes reply controls for read-only platforms
type: feedback
status: active
last_verified: 2026-09-01
topics: [messages, social-inbox, information-architecture, frontend]
---

**Rule:** Messages is a conversation-first omnichannel inbox. The module navigation column lists comment and DM conversations across the selected organization or brand, while the main canvas shows the selected transcript and its available reply actions. Search and filters refine the conversation list; they do not replace it.

**Why:** Vincent corrected the filter-dashboard layout because Messages is an operational reply workspace, not a reporting surface. Its interaction model should match agent threads: choose a conversation in the navigation column, then work in the main conversation canvas.

**How to apply:**

- When no supported social account is connected, make connecting an account the first empty-state action.
- When accounts are connected but no conversations exist, offer the appropriate sync action and a secondary account connection action.
- Show comments and DMs in the same latest-activity conversation list, with platform, brand, type, unread/review state, preview, and timestamp visible at scan speed.
- Keep status, brand, and platform filters secondary to the list.
- Derive the composer from the selected conversation's server-owned capabilities. Read-only platforms such as TikTok show an explicit read-only state and no reply, DM, or agent-draft controls.
- Preserve organization-wide `~/` scope; never silently connect an account to a stale selected brand when a brand choice is required.
