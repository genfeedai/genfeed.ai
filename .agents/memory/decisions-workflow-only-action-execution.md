---
name: Workflow-only action execution decisions
description: Hard-cut decisions for making every audited product operation an action-backed workflow node
type: decision
status: active
last_verified: 2026-08-28
topics: [actions, workflows, agent, mcp, api, website, workers]
---

# Workflow-only action execution decisions

## Selected architecture

Genfeed has one product-operation execution model:

`entry surface -> workflow graph -> action-backed nodes -> shared action executors`

Website routes, API controllers, Agent, MCP, workers, schedulers, and internal
automation may validate, authorize, enqueue, and serialize. They do not own a
second orchestration path for product behavior.

Every reusable Genfeed action has one stable action ID. Workflow node
definitions are generated from the action catalog, and each action node delegates
to the one registered executor for that action ID. Missing definitions, duplicate
registrations, and missing executors fail closed at boot or architecture-check
time. An action implementation is never copied into a workflow executor.

## Rollout decision

Three approaches were considered:

1. **Staged vertical migration.** Establish the contract and migrate one complete
   YouTube-to-long-form path before the remaining bypasses. This limits review
   scope but leaves two execution models live between PRs.
2. **Foundation first.** Land contracts and enforcement before user behavior.
   This is mechanically safe but intentionally leaves the audited bypasses in
   production.
3. **Selected: one hard-cut refactor.** Migrate every audited bypass, the long-form
   user path, system actions, macro executors, legacy steps, and fallback nodes in
   one branch/PR. This has the largest blast radius, but it is the only option that
   does not bless a transitional legacy path.

## Legacy data decision

`Workflow.steps` contains persisted customer data. The hard cut therefore uses a
one-time database migration that converts supported step JSON into action-backed
immutable workflow graph versions. The same migration rejects or quarantines
rows it cannot convert instead of silently dropping behavior. After conversion,
the `steps`, `nodes`, and `edges` definition blobs on `Workflow`, DTOs,
serializers, MCP/CLI legacy contracts, scheduler branch, enums used only by
legacy steps, and step runner are deleted. There is no dual read, dual write,
fallback, or runtime compatibility mode.

## Workflow definition persistence

The mutable `Workflow` row is identity and ownership, not the executable graph.
Each saved/published definition is an immutable `WorkflowVersion` containing one
validated JSONB graph document, input schema, version number, and content hash.
`WorkflowExecution` references the exact version it started with. Runtime node
results and idempotency claims remain normalized relational rows.

The graph remains one JSONB aggregate per immutable version because the canvas is
validated, cloned, published, and executed as a unit. Definition nodes and edges
are not normalized into separate tables: doing so would add joins and multi-row
write coordination while node configuration would still be JSON. Schedules and
triggers resolve a published version when creating an execution.

## System workflow visibility

Hidden Genfeed system workflows and user-visible workflow templates are separate
concepts:

- A hidden system workflow is an app-owned graph executed by the normal workflow
  engine. Customer app surfaces do not list or mutate it.
- A user-visible official template is an installable graph definition. Its
  tenant-owned installation is an ordinary editable workflow.
- A callback wrapped in workflow-shaped provenance records is neither one and is
  removed.

## Rejected compatibility mechanisms

- callback-based `SystemWorkflowProvenanceService.runAction`
- `systemWorkflowAction` nodes without an engine executor
- pass-through or skipped fallback executors
- legacy `Workflow.steps` scheduling or execution
- Agent/MCP-specific implementations of the same action
- direct public-tool queues that bypass workflow execution
- disconnected Redis transcript/article channels
- service methods that conceal a multi-step workflow behind a macro node
