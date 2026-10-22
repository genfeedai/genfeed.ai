---
name: Brand campaign MCP decisions
description: Scope and alternatives for first-class campaign context through MCP
type: reference
last_verified: 2026-10-22
---

# Decisions
- Extend Campaign (#4120) rather than create another campaign entity or publisher. Existing briefs, lifecycle and release links are the source of truth.
- Tags-only grouping would not enforce brand context or preserve a durable brief. A parallel campaign/publisher would duplicate approval and delivery logic. Extend the current domain.
- Readiness is a scheduling prerequisite: classify it under scheduler so default clients load it.
- Native MCP campaign management uses a single action-based tool. Reads and draft-context writes remain zero-credit operations; scheduling stays on the existing approval-required tools.
- Assets remain canonical Library ingredients; campaign membership stores bounded IDs, validated on writes and before generation. No media cloning.
- Product contracts and acceptance live here and on GitHub; private campaign strategy and posting receipts belong in the private vault.
