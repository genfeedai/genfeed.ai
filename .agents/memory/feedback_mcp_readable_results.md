---
name: Readable MCP tool results
description: Display readable messages; keep identifiers and full payloads in structured results
type: feedback
last_verified: 2026-10-15
---

MCP tool results must provide readable display text rather than serialized objects
or internal identifiers. Account lookup should return an account message without
opening a content widget, including when only profile or credits are requested.

**Why:** A routine account lookup exposed raw profile JSON and opaque user and
organization IDs in the conversation instead of a useful confirmation.

**How to apply:** Keep identifiers, approval references, and full payloads in
structured results for follow-up calls. Summarize status, names, amounts, empty
results, and corrective actions in text. Keep media playable and links readable.
Clients must read structured fields instead of parsing display text as JSON.
