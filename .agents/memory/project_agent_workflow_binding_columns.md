---
name: agent_workflow_binding_columns
description: AgentStrategy preferredWorkflowId/templateId/workflowInputOverrides are first-class columns — not open config JSON maps
type: project
last_verified: 2026-08-12
---

# Agent strategy workflow binding (columns)

## Rule

Agent → deterministic workflow binding lives on **columns**, not freeform `config` blobs:

| Column | Type | Purpose |
| --- | --- | --- |
| `preferredWorkflowId` | `String?` | Installed workflow id (org-scoped by service) |
| `preferredWorkflowTemplateId` | `String?` | Seeded template id for install-on-first-run |
| `workflowInputOverrides` | `Json` array | **Only** `[{ key, value }]` scalars |

No `additionalProperties: true` maps for overrides. No nested objects.

Migration: `20260812180000_agent_strategy_workflow_binding` backfills from legacy config keys and strips them.

## How to apply

- Write via `COLUMN_BACKED_KEYS` in `AgentStrategiesService.toPrismaWriteData`.  
- Run path reads columns first; legacy config is read-only fallback until all envs migrate.  
- Prefer empty overrides + run-time body (`topic`/`prompt`) over growing saved maps.
