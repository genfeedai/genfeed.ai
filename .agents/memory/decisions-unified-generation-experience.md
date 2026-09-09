---
name: Unified generation experience decisions
description: Reuse generation and activity infrastructure through shared UI and scoped adapters
type: project
last_verified: 2026-09-09
---

**Why:** Cosmetic loader replacement leaves users unable to track long jobs. A new universal job backend duplicates existing durable activity and ingredient records and increases migration risk.

**How to apply:** Consolidate presentation and reconcile existing records. Keep asset-specific media players; adapt platform target data to the canonical social renderer. Activity is the durable generation tracker; workflow notifications remain in the existing inbox. Never generate fake email deliveries to populate a bell. Studio currently supports five media types, while social text results are generated in the agent and previewed in publishing.

Planning: native Codex parent with bounded preview and activity lanes. User request authorizes implementation and tracker/PR delivery. No cross-provider implementation.
