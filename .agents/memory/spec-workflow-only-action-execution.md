---
name: Workflow-only action execution spec
description: Hard-cut specification for action-backed nodes and one workflow engine across every audited entry surface
type: project
status: active
last_verified: 2026-08-28
topics: [actions, workflows, youtube, articles, newsletters, agent, mcp, api, website, workers]
---

# Workflow-only action execution spec

## Purpose

Replace Genfeed's parallel product-operation paths with one workflow execution
model. A workflow graph owns sequencing; every step resolves to one reusable
Genfeed action; every entry surface triggers the graph; hidden system workflows
run through the same engine as tenant-authored workflows.

The first user-visible proof is a free website tool that accepts a YouTube URL
and creates long-form text for a standard article, LinkedIn article, X article,
or newsletter without duplicating transcription or generation logic.

## Non-goals

- Preserve runtime support for `Workflow.steps`.
- Preserve provenance-only workflow callbacks or pass-through executors.
- Keep separate Agent, MCP, website, API, or worker implementations for one
  action.
- Make hidden Genfeed system workflows visible in customer app surfaces.
- Replace the workflow engine or introduce an external automation engine.

## Interfaces

### Action contract

Each action definition has:

- a stable action ID;
- one JSON-schema input contract;
- one output contract;
- credit, authorization, idempotency, and approval metadata;
- one registered executor;
- one generated workflow node definition that references the action ID.

Action execution receives organization, user, brand, workflow, run, node,
origin, and idempotency context. Executors return structured data and metadata;
entry surfaces adapt only the presentation envelope.

### Workflow contract

`Workflow` persists stable identity, ownership, visibility, and lifecycle.
Immutable `WorkflowVersion` records persist one validated JSONB graph document,
input schema, version number, and graph hash. `WorkflowExecution` references the
exact workflow version it started with. A node that performs product behavior
must reference a registered action ID. Control-flow nodes may be engine-native,
but cannot perform hidden product operations.

Hidden system graphs live in the code-owned catalog and execute through the
normal workflow executor. The system runner accepts a canonical workflow ID,
input values, and execution context. It does not accept an arbitrary callback.

### Entry surfaces

- Website/API: authorize and invoke the intended workflow; serialize its run or
  terminal output.
- Agent/MCP: resolve the curated action to its action-backed workflow and invoke
  it; presentation cards and MCP text remain adapters over the same result.
- Schedulers/workers: enqueue or resume workflow executions only. Infrastructure
  queue maintenance may remain outside product workflows.

### YouTube long-form workflow

The hidden graph is composed from reusable actions:

`resolve YouTube source -> obtain transcript -> transform long-form text -> persist selected output`

The output selector supports standard article, LinkedIn article, X article, and
newsletter. Each output action uses the same transcript and transformation
contracts. The website free tool invokes this graph; it does not enqueue a
separate clip or generation pipeline.

## Key decisions

- Generate action-node definitions from the curated action catalog instead of
  maintaining a second hand-written node inventory.
- Register action executors once in a shared server registry and fail closed on
  missing or duplicate registrations.
- Store each executable graph as an immutable version and bind executions to that
  version so edits cannot change a running/retried execution.
- Separate hidden system workflow graphs from user-visible official templates.
- Convert persisted legacy steps in one database migration, then drop the field
  and delete runtime compatibility.
- Decompose macro sweep/cycle nodes when they sequence or iterate product
  operations; keep a single node only when it represents one atomic action.
- Extend existing architecture checks rather than add a new named CI guard.

## Edge cases and failure modes

- Invalid or unsupported YouTube URLs fail before credits or persistence.
- Transcript unavailability produces a failed node with an actionable error; no
  article/newsletter is created.
- Workflow retries use run/node-derived idempotency keys so external effects and
  persistence do not duplicate.
- Missing action executors, duplicate action IDs, orphan node definitions, and
  action nodes without catalog entries fail closed.
- The legacy-data migration aborts on unconvertible step categories instead of
  silently erasing customer workflows.
- Tenant-scoped actions retain organization and soft-delete filters; brand-bound
  actions reject context mismatches.
- A partially failed graph preserves node results and can resume through the
  workflow engine; entry surfaces do not restart bespoke pipelines.

## Acceptance criteria

- THE SYSTEM SHALL execute every audited product-operation path through the
  workflow engine and action-backed nodes.
- THE SYSTEM SHALL expose exactly one executor registration for every action
  referenced by an executable workflow node.
- IF an action node has no definition or executor THEN THE SYSTEM SHALL fail
  closed before reporting a successful run.
- THE SYSTEM SHALL remove `SystemWorkflowProvenanceService.runAction` callback
  execution and `systemWorkflowAction` provenance-only nodes.
- THE SYSTEM SHALL remove pass-through/skipped fallback executors.
- THE SYSTEM SHALL convert persisted legacy workflow steps to nodes in a
  one-time immutable-version migration and SHALL remove the legacy `steps`,
  `nodes`, and `edges` definition fields and legacy runners from `Workflow`.
- WHEN a workflow execution starts THE SYSTEM SHALL bind it to an immutable
  workflow version and SHALL use that version for retries and resumes.
- THE SYSTEM SHALL decompose audited macro nodes that conceal multi-operation
  sweeps, cycles, or orchestration.
- WHEN Website, Agent, MCP, API, a scheduler, or a worker invokes the same action
  THE SYSTEM SHALL reach the same registered action executor through a workflow
  run.
- WHEN a free-tool user submits a valid YouTube URL and selects standard article,
  LinkedIn article, X article, or newsletter THE SYSTEM SHALL run the same hidden
  source/transcript/transform graph and persist only the selected output type.
- THE SYSTEM SHALL hide internal system workflows from customer app workflow
  lists while continuing to expose separately installable official templates.
- IF new direct article, newsletter, LinkedIn, public-tool, product-cron, social,
  or generation orchestration is added outside an action-backed workflow THEN the
  existing architecture check SHALL fail.

## Test plan

- Contract tests for catalog/action-node/executor one-to-one coverage and
  duplicate rejection.
- Workflow engine tests proving action input mapping, output mapping,
  authorization context, idempotency, missing-executor failure, and resume.
- Migration tests covering every legacy step category, graph-version creation,
  execution version binding, and an unconvertible row.
- Regression tests for removal of callback provenance, fallbacks, and legacy
  scheduler execution.
- Focused API/Agent/MCP/public-tool tests proving identical workflow/action IDs
  and results across entry surfaces.
- Focused YouTube long-form tests for each output type, invalid URLs, missing
  transcripts, retries, and tenant/brand scope.
- Existing architecture and cron-boundary checks expanded to the audited files.
