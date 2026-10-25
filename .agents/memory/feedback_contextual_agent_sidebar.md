---
name: contextual agent sidebar
description: One agent sidebar header, real shared components, contextual icon cards, and unchanged full-page presentation
type: feedback
last_verified: 2026-10-25
---

The contextual agent sidebar uses one header with Chat, Context, and History views.
Conversation commands belong in the labeled More menu. Suggested actions use
squared shared cards with the same icons as their corresponding features and
follow the current page and selected records. Reuse the current shared dropdown
UI. Preserve the full-page agent presentation.

**Why:** The previous sidebar mixed thread management, panel controls, and generic
suggestions. A prototype that recreated the application shell and cloned controls
hid the actual layout and component behavior.

**How to apply:** Compose the real shared components inside the existing app shell.
Keep the real conversation, drafts, selected-record references, and running work
when changing views. An HTML prototype request receives an actual standalone HTML
page; surrounding application UI is preserved or omitted, never reconstructed.
Use the feature's canonical icon rather than assigning another glyph to the same
meaning. Prototype sources stay on their captured branch; production behavior
uses the existing state and transport.
