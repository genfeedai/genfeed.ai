---
name: Agent fleet runtime API
description: Durable hired-agent identity, conversations, capabilities, routines, account assignments, runs, reports, and unified live activity
type: project
status: proposed
last_verified: 2026-08-31
topics: [agent, api, workflows, actions, skills, memory, automation, realtime, fleet]
---

# Agent Fleet Runtime API Spec

## Purpose

Make every hired Genfeed agent a durable, conversational worker rather than a
workflow preset. An operator can hire an agent, open its permanent bot-like
home, chat with it, grant capabilities and account access, schedule routines,
watch its work live, review everything it did while the operator was away, and
receive check-ins or requests for attention.

This specification connects the existing Agent chat runtime, Agent Team
strategies, curated action catalog, skills, workflows, credentials, approvals,
tasks, reports, and execution telemetry behind one agent identity and one
operator-facing interface.

## Optimization Target

Optimize first for **identity continuity**, then **auditable execution**, then
**capability extensibility**. A hired agent must remain the same worker across
chat turns, scheduled routines, workflow executions, delegated work, reports,
and restarts. Adding a new action, skill, workflow, or connected account must
not require another agent type or another execution path.

## Current-State Audit

- `AgentStrategy` already carries organization/user/brand scope, role type,
  platform preferences, budgets, policy, reports, and one preferred workflow.
- `AgentThread` carries the live conversation experience, messages, thread
  events, snapshots, memory, streaming, tools, and input requests, but has no
  durable relation to `AgentStrategy`.
- Agent Hub can activate a strategy, run its preferred workflow, trigger
  Autopilot, and inspect workflow history, but cannot open a conversation with
  that hired identity.
- A proactive execution currently creates a new `source=proactive` thread for
  each run and carries `strategyId` only in request/execution metadata.
- Workflow runs have strong execution records and conditional polling; Agent
  Chat has realtime events; generic Workspace Activity has broad product
  events. No one persisted cursor joins all three into a Fleet timeline.
- Strategy reports and recipient fields exist in backend contracts, while
  `reportsToLabel` is presentation-only and the hired-agent UI has no report
  inbox or durable delivery outcome.

This is primarily a missing identity/provenance composition, not a need to
replace the existing engines.

## Non-Goals

- Expose model chain-of-thought, hidden reasoning, prompt text, credential
  secrets, or staff conversation review.
- Give an agent its own Better Auth user or long-lived bearer token.
- Replace the curated action catalog, workflow engine, scheduler, task system,
  notification outbox, or credential model.
- Turn every chat response into a user-authored workflow.
- Let an agent silently select one social account when multiple candidates
  exist.
- Preserve `AgentStrategy` and `/agent-strategies` as a second public identity
  after the new client is migrated.

## Core Model

```text
Human operator
    ↕ chat, approvals, reports
Agent (durable identity)
    ├── Conversations (AgentThread)
    ├── Runs (turn, action, workflow, delegation, report)
    ├── Capability grants (actions, workflows, skills)
    ├── Resource assignments (brands, credentials, libraries, campaigns)
    ├── Routine assignments (workflow + trigger + input bindings)
    ├── Reporting line and delegation grants
    ├── Memory and policy
    └── Activity events → Fleet/Mission Control
```

An agent is not a workflow. A workflow is one deterministic capability that an
agent may invoke or be scheduled to run. An agent can have zero, one, or many
workflows and still converse, reason over authorized context, use curated
actions, apply skills, create tasks, request approval, delegate, remember, and
report.

## Terminology

- **Agent** — the persistent hired-worker identity, configuration, policy, and
  lifecycle.
- **Conversation** — an `AgentThread` belonging to one agent. Every agent has a
  primary conversation and may have additional threads.
- **Run** — one accepted unit of work with provenance, status, budget, result,
  and optional links to a thread or workflow execution.
- **Action** — one reviewed atomic product capability from the curated action
  catalog.
- **Workflow** — an immutable-versioned deterministic graph of action-backed
  nodes and control flow.
- **Skill** — versioned procedural or behavioral guidance resolved into the
  agent runtime.
- **Routine assignment** — the explicit association between an agent, a
  workflow, a trigger/schedule, and typed input bindings.
- **Resource assignment** — authorization to use a brand, credential, library,
  campaign, or other tenant resource.
- **Activity event** — a durable, privacy-preserving operational fact used for
  replay and live Fleet views.
- **Report** — a durable agent-authored summary/check-in addressed through a
  real reporting line or recipient list.

## System Invariants

1. `Agent.id` is the identity used by conversations, runs, workflows,
   delegation, reports, activity, and UI routes.
2. Every run has `organizationId`, `agentId`, an actor, a trigger, an
   idempotency key, and a terminal or resumable status.
3. Every `AgentThread` used by a hired agent has `agentId`; scheduled work does
   not create a new unowned thread per execution.
4. Every workflow execution started by an agent links to an `AgentRun`; the run
   links to the immutable workflow version that executed.
5. Every consequential transition appends one `AgentActivityEvent` in the same
   transaction as the authoritative state change or through a recoverable
   outbox.
6. Agent capabilities are allowlisted. The effective set is the intersection
   of deployment availability, organization entitlement, agent grants, actor
   permission, resource assignment, policy, budget, and approval state.
7. Delegation never expands authority. A child run receives the intersection of
   parent authority and the target agent's authority.
8. Account identity is explicit. Acting as one account requires a
   `credentialId`; fan-out requires an explicit platform-fan-out assignment.
9. Every tenant query includes `organizationId` and `isDeleted: false`.
10. Activity and reporting surfaces never expose hidden reasoning or raw prompt
    text. They expose objectives supplied by the user when the user can already
    see them, safe status summaries, action/workflow identifiers, artifacts,
    costs, errors, and decisions requiring attention.

## Persistence Contracts

### Agent

Promote the current `AgentStrategy` row into the canonical `Agent` model while
preserving IDs during migration.

Required fields:

- `id`, `organizationId`, `ownerUserId`, optional `brandId`
- `name`, `displayRole`, `description`, optional avatar/persona presentation
- lifecycle: `active`, `paused`, or `degraded`; deletion remains `isDeleted`
- `agentType` as a capability/persona preset, never an execution engine
- `primaryThreadId`
- model preference, autonomy policy, credit budgets, approval policy,
  reporting policy, timezone
- optimistic `configVersion`
- `createdAt`, `updatedAt`, `isDeleted`

Operational status (`idle`, `working`, `waiting_for_input`, `blocked`) is a
projection from active runs and pending requests. It is not a manually writable
presence field.

### AgentThread

Add required `agentId` for hired-agent threads and index
`(organizationId, agentId, isDeleted, updatedAt DESC)`. The primary thread is
created transactionally when an agent is hired. Scheduled runs append a concise
check-in to this thread when configured; they do not manufacture a new agent
identity.

User-created general assistant threads may remain agentless during migration,
but an agent page never opens an agentless thread.

### AgentCapabilityGrant

One normalized grant per agent and capability:

- `kind`: `action`, `workflow`, or `skill`
- stable catalog key or tenant resource ID
- optional pinned version for workflows/skills
- typed constraints such as allowed modes or approval requirement
- `organizationId`, `agentId`, `isDeleted`, timestamps

Unknown catalog keys and cross-organization resource IDs fail closed.

### AgentAccountAssignment

Account access is explicit and separate from capability access:

- exact account: `mode=credential`, `credentialId`
- intentional fan-out: `mode=platform_fanout`, `brandId`, `platform`
- permissions: `read`, `analyze`, `publish`, `reply`, or `manage`

Platform is derived from a credential for exact assignments. A credential must
belong to the agent's authorized organization and brand. No assignment stores
tokens or provider secrets.

### AgentRoutineAssignment

This is the correct place to associate an agent with a workflow:

- `agentId`, `workflowId`, optional pinned/published version policy
- trigger/schedule identity
- typed input bindings and defaults
- purpose label, enabled state, timezone
- reporting/check-in behavior
- failure and approval policy

An agent may own many routine assignments. Removing a routine never removes the
agent or its conversation history.

### AgentRun

One row per accepted unit of work:

- `id`, `organizationId`, `agentId`, optional `threadId`
- optional `parentRunId`, `workflowExecutionId`, or delegated agent/run IDs
- kind: `turn`, `action`, `workflow`, `delegation`, or `report`
- trigger: `user`, `schedule`, `event`, `webhook`, `agent`, or `system`
- actor type/id and safe objective summary
- status: `queued`, `running`, `waiting_for_input`, `waiting_for_approval`,
  `completed`, `failed`, or `cancelled`
- requested and effective capability/resource references
- credit budget/usage, timestamps, redacted error, result/artifact references
- organization-scoped idempotency key

`AgentRun` is the common provenance record. A workflow execution remains the
authoritative graph run; an agent run remains the authoritative worker run.

### AgentActivityEvent

Append-only event fields:

- `id`, organization monotonic cursor, `organizationId`, `agentId`
- optional `runId`, `threadId`, `workflowExecutionId`, `taskId`, `credentialId`
- typed event key and schema version
- privacy-safe summary and structured metadata
- actor type/id, occurred time, deduplication key

The event store powers both historical replay and realtime delivery. Generic
workspace activity may project selected events, but it is not the source of
truth for Fleet.

### Reporting And Relationships

- Replace `reportsToLabel` with a real `AgentReportingLine` containing exactly
  one supervisor: a canonical `users.id` or another `Agent.id` in the same
  organization.
- Reporting-line writes reject self-reference and cycles.
- `AgentDelegationGrant` explicitly lists which agents may delegate to which
  other agents and any capability/budget ceiling.
- Rename/promote `AgentStrategyReport` to `AgentReport`, linked to `agentId`,
  optional `runId`, reporting period, recipients, delivery state, and the
  primary thread message used as the visible check-in.

## HTTP API

All routes use the existing `/v1` prefix, bearer/session authentication,
class-validator DTOs, OpenAPI decorators, serializers from
`packages/serializers`, and the repository's standard error envelope. Resource
responses use JSON:API. Accepted asynchronous work returns an `AgentRun`
resource with `202 Accepted`.

### Agent Identity

| Method | Route | Contract |
| --- | --- | --- |
| `GET` | `/agents` | Cursor-paginated fleet list; filters: `brandId`, lifecycle/status, type, manager, capability, credential, attention, `updatedSince` |
| `POST` | `/agents` | Hire an agent and transactionally create its primary thread |
| `GET` | `/agents/:agentId` | Agent profile with status, primary thread, current run, next routine, usage, attention count |
| `PATCH` | `/agents/:agentId` | Update identity, lifecycle, model preference, policy, budget, or presentation with `expectedConfigVersion` |
| `DELETE` | `/agents/:agentId` | Soft-delete after active-run and retention policy checks |

`POST /agents` accepts identity, initial policy, and an optional reviewed hire
preset ID. The server may expand that preset into initial grants transactionally;
the client cannot submit an unbounded mixed configuration object. Capabilities,
accounts, routines, and relationships retain separate typed interfaces for
later configuration.

### Conversations And Bot Turns

| Method | Route | Contract |
| --- | --- | --- |
| `GET` | `/agents/:agentId/threads` | Cursor-paginated conversations for this agent |
| `POST` | `/agents/:agentId/threads` | Create an additional conversation owned by this agent |
| `GET` | `/agents/:agentId/threads/:threadId` | Thread snapshot and current run/attention state |
| `PATCH` | `/agents/:agentId/threads/:threadId` | Rename, pin, archive, or compare-and-swap brand context |
| `GET` | `/agents/:agentId/threads/:threadId/messages` | Cursor-paginated chronological messages |
| `POST` | `/agents/:agentId/threads/:threadId/turns` | Accept a user turn and return `202` with its `AgentRun` |
| `POST` | `/agents/:agentId/threads/:threadId/input-requests/:requestId/responses` | Resolve a pending request and resume its run |

The turn request contains `content`, attachment/artifact references,
`clientRequestId`, optional model override, plan-mode flag, and expected context
version. The client never supplies an arbitrary tool list; the server resolves
effective capabilities from `agentId`.

### Capabilities

| Method | Route | Contract |
| --- | --- | --- |
| `GET` | `/agents/:agentId/capabilities` | Persisted action, workflow, and skill grants |
| `PUT` | `/agents/:agentId/capabilities` | Atomically replace the desired grant array with optimistic version checking |
| `GET` | `/agents/:agentId/effective-capabilities` | Explain what is currently usable and why anything is denied |

Example replacement request:

```json
{
  "expectedVersion": 4,
  "grants": [
    { "kind": "action", "key": "posts.create" },
    { "kind": "workflow", "resourceId": "wf_release_loop" },
    { "kind": "skill", "key": "platform-x", "version": "3" }
  ]
}
```

Action keys must exist in the curated action catalog. Workflow and skill IDs
must resolve inside the authorized tenant/deployment scope.

### Accounts And Other Resources

| Method | Route | Contract |
| --- | --- | --- |
| `GET` | `/agents/:agentId/account-assignments` | List exact-account and explicit fan-out assignments |
| `PUT` | `/agents/:agentId/account-assignments` | Atomically replace assignment array after tenant/brand validation |
| `GET` | `/agents/:agentId/resource-grants` | List non-account brand/library/campaign grants |
| `PUT` | `/agents/:agentId/resource-grants` | Atomically replace non-account resource grants |

An action requiring an account returns `409 ACCOUNT_ASSIGNMENT_REQUIRED` when
the agent has no unambiguous authorized assignment. It never calls
`findFirst()` by platform.

### Routines And Work

| Method | Route | Contract |
| --- | --- | --- |
| `GET` | `/agents/:agentId/routines` | List the agent's workflow routine assignments |
| `POST` | `/agents/:agentId/routines` | Create a workflow-backed routine and its trigger/schedule |
| `PATCH` | `/agents/:agentId/routines/:routineId` | Update schedule, inputs, policy, or enabled state |
| `DELETE` | `/agents/:agentId/routines/:routineId` | Disable and soft-delete the routine, never the agent |
| `POST` | `/agents/:agentId/runs` | Start explicit objective, action, workflow, delegation, or report work |
| `GET` | `/agent-runs` | Cursor-paginated runs filtered by agent, brand, kind, status, trigger, workflow, credential, date, or attention |
| `GET` | `/agent-runs/:runId` | Run details with safe timeline and related resources |
| `PATCH` | `/agent-runs/:runId` | The only user transition is cancellation of a cancellable run |

`POST /agents/:agentId/runs` uses one discriminated request object:

```json
{
  "clientRequestId": "client-generated-id",
  "threadId": "thread_optional",
  "request": {
    "type": "workflow",
    "workflowId": "wf_release_loop",
    "inputValues": { "topic": "August launch" }
  }
}
```

Other request types are `objective`, `action`, `delegation`, and `report`.
Each has a closed DTO; no free-form union is passed through to an executor.

### Reporting And Delegation

| Method | Route | Contract |
| --- | --- | --- |
| `GET` | `/agents/:agentId/reporting-line` | Resolve the real human or agent supervisor |
| `PUT` | `/agents/:agentId/reporting-line` | Replace the reporting line after scope and cycle validation |
| `GET` | `/agents/:agentId/delegation-grants` | List allowed target agents and ceilings |
| `PUT` | `/agents/:agentId/delegation-grants` | Atomically replace delegation grants |
| `GET` | `/agent-reports` | Cursor-paginated reports filtered by agent, recipient, period, delivery, or date |
| `GET` | `/agent-reports/:reportId` | Report, related runs/artifacts, recipients, and delivery outcome |

Generating a report is `POST /agents/:agentId/runs` with
`request.type=report`; there is no parallel `report-now` execution path.

### Fleet And Historical Activity

| Method | Route | Contract |
| --- | --- | --- |
| `GET` | `/agent-fleet` | Organization snapshot: counts, attention, active/blocked agents, current work, spend, next routines |
| `GET` | `/agent-activity-events` | Cursor-paginated event replay with `from`, `to`, `agentId`, `brandId`, event family, status, run, workflow, credential, and attention filters |

`from` and `to` are ISO timestamps. The Fleet UI defaults to the trailing 24
hours and can resume from the last event cursor after being offline.

## Realtime Protocol

Reuse the authenticated Agent WebSocket transport. REST is the durable replay
contract; WebSocket delivery is a low-latency projection, never the only copy.

Client command:

```json
{
  "type": "agent.fleet.subscribe",
  "afterCursor": "optional-last-seen-cursor",
  "filters": { "brandId": "optional", "agentIds": [] }
}
```

Server event envelope:

```json
{
  "eventId": "evt_123",
  "cursor": "104298",
  "type": "agent.run.updated",
  "occurredAt": "2026-08-31T12:00:00.000Z",
  "organizationId": "org_123",
  "agentId": "agent_123",
  "runId": "run_123",
  "data": {}
}
```

Required event families:

- agent hired, activated, paused, degraded, restored, or deleted
- capability, resource, account, routine, or relationship changed
- run queued, started, waiting, resumed, completed, failed, or cancelled
- action/workflow/delegation started, progressed, completed, or failed
- input/approval requested or resolved
- artifact/task/report created or updated
- budget threshold reached or account authorization lost

Reconnect behavior:

1. Client reconnects with its last cursor.
2. Server replays missed authorized events from Postgres.
3. Server joins the organization/agent rooms for new events.
4. If the cursor is outside retention, server returns `cursor_expired` and the
   client reloads `/agent-fleet` plus a bounded event window.

## Runtime Interface

All entry surfaces call one deep runtime module:

```typescript
AgentRuntime.startRun(agentId, request, actorContext): Promise<AgentRunReceipt>
```

The caller supplies identity, intent, and authenticated actor context. The
module owns capability resolution, scope checks, budget reservation,
idempotency, thread/run persistence, workflow/action dispatch, activity events,
approval/input suspension, reporting, and terminal projection. Controllers,
schedulers, WebSocket handlers, and workers do not reproduce those decisions.

### Capability Resolution Order

1. Load tenant-scoped active agent and actor.
2. Resolve deployment and organization-entitled catalogs.
3. Intersect agent capability grants.
4. Resolve brand/resource/account assignments.
5. Apply actor membership, agent policy, budget, and approval requirements.
6. For delegation, intersect the parent and target effective sets.
7. Freeze the resulting capability/resource snapshot on `AgentRun`.
8. Dispatch only through the canonical action/workflow executors.

## Why Workflows Still Exist

Workflows are correct for repeatable, multi-step, side-effecting work because
they provide immutable versioning, typed inputs, deterministic sequencing,
idempotency, retries/resume, approvals, progress, credit accounting, and node
logs. They are also the canonical executable unit for schedules.

The current mistake is not using workflows. It is treating one preferred
workflow as the agent itself. The corrected relationship is:

```text
Agent identity 1 ── N RoutineAssignment N ── 1 Workflow
Agent run      1 ── 0..1 WorkflowExecution
```

Direct conversation does not require the operator to choose a workflow. The
agent runtime may answer directly, select a curated action, invoke an authorized
workflow, request approval, or delegate. Product actions still execute through
the canonical action-backed workflow infrastructure; this does not make the
agent permanently bound to a single customer workflow.

## Authorization And Safety

- Agents are not authentication principals. Every run records the human/system
  actor and acts through scoped server authorization.
- Scheduled runs use a system actor plus the agent owner/configuration
  provenance. If ownership or membership is invalid, the routine pauses and
  requests attention.
- Only organization owners/admins may hire, delete, change capability/account
  grants, reporting lines, or autonomy policy. Authorized members may chat and
  approve within their own membership role.
- Credential secrets never enter DTOs, activity metadata, reports, or model
  context. Executors resolve them server-side by authorized `credentialId`.
- Consequential actions preserve existing approval policy and fail closed on
  stale context versions, ambiguous accounts, expired credentials, missing
  capabilities, or exhausted budgets.
- Fleet views show safe operational facts, not chain-of-thought. User-visible
  messages remain available only through the normal conversation surface and
  its ownership rules.

## Standard Errors

Use the existing `ErrorResponse` envelope and stable codes including:

- `AGENT_NOT_FOUND`
- `AGENT_INACTIVE`
- `AGENT_CONFIG_VERSION_CONFLICT`
- `CAPABILITY_DENIED`
- `RESOURCE_SCOPE_DENIED`
- `ACCOUNT_ASSIGNMENT_REQUIRED`
- `ACCOUNT_AUTHORIZATION_EXPIRED`
- `WORKFLOW_NOT_GRANTED`
- `INPUT_REQUIRED`
- `APPROVAL_REQUIRED`
- `BUDGET_EXHAUSTED`
- `DELEGATION_DENIED`
- `REPORTING_LINE_CYCLE`
- `RUN_NOT_CANCELLABLE`
- `EVENT_CURSOR_EXPIRED`

Use `400` for invalid DTOs, `401` for missing authentication, `403` for denied
authority, `404` for tenant-safe absence, `409` for state/config conflicts,
`422` for valid but unsatisfied run requirements, and `429` for rate limits.

## Product Surface Contract

### Agent Home

Opening a hired agent defaults to its primary conversation and keeps the bot
identity visible while navigating:

- **Chat** — permanent primary conversation, additional threads, streaming
  work, attachments, approvals, and input requests.
- **Activity** — this agent's replayable run/action/workflow/task/report events,
  defaulting to the trailing 24 hours.
- **Work** — current run, queued work, routines, schedules, and execution
  lineage.
- **Capabilities** — granted actions, workflows, skills, and effective-denial
  explanations.
- **Accounts** — exact credentials and explicit platform-fan-out assignments,
  showing handles/avatars without secrets.
- **Reports** — check-ins, reporting line, source work, recipients, and delivery
  outcomes.
- **Settings** — persona, model, autonomy, budgets, approvals, lifecycle, and
  delegation.

The top-level actions are **Chat**, **Give work**, **Pause/Resume**, and
**Configure**. “Run workflow” is available from Work or capability selection;
it is not the agent's primary identity action.

### Fleet/Mission Control

The Fleet surface consumes `/agent-fleet`, `/agent-runs`, and
`/agent-activity-events` plus the realtime subscription. It shows:

- every hired agent grouped by organization, brand, and reporting hierarchy;
- derived status, current task, current action/workflow, elapsed time, and
  progress;
- “Needs you” input/approval/account/budget failures;
- last check-in, last completed work, next routine, and report health;
- credits today/period and failure/degraded indicators;
- a global trailing-24-hour timeline with agent, brand, account, run, workflow,
  status, and event filters.

Fleet is an operator projection. Conversation content remains on the agent's
authorized Chat surface; Fleet links to the relevant message/run/artifact
without becoming a staff prompt-review interface.

## End-To-End Product Flows

### Hire And Chat

1. Operator hires an agent with `POST /agents`.
2. Server persists the identity and primary thread transactionally.
3. Operator assigns capabilities, accounts, reporting line, and routines.
4. Agent page opens the primary thread and Fleet status.
5. A turn creates an `AgentRun` and returns `202`.
6. WebSocket events stream status, tools, artifacts, input requests, and final
   message into the same bot experience.
7. The conversation remains attached to the same agent after refresh/restart.

### Scheduled Autonomous Work

1. Scheduler resolves an enabled `AgentRoutineAssignment` and published
   workflow version.
2. `AgentRuntime.startRun` creates one scheduled agent run.
3. The runtime starts the linked workflow execution with frozen scope and
   idempotency context.
4. Workflow transitions append Fleet activity and update agent status.
5. Approval/input requests put the agent in `waiting_for_*` and surface under
   “Needs you.”
6. Completion links artifacts, updates usage, and optionally posts a check-in to
   the primary conversation and durable report recipients.

### Delegation

1. Parent agent requests delegation to an explicitly granted target agent.
2. Runtime validates the relationship and computes the authority intersection.
3. Child `AgentRun` links `parentRunId`, source agent, and target agent.
4. Both agent pages and Fleet show the delegation lineage.
5. Child completion returns a structured result to the parent run and may post
   an operator-visible check-in.

## Migration And Hard Cut

1. Rename/promote `AgentStrategy` to `Agent`, preserving IDs and tenant fields.
2. Create a primary `AgentThread` for every live hired agent and add `agentId`
   relations. Backfill links only where current metadata proves the strategy;
   never guess from labels.
3. Introduce `AgentRun`, grants, assignments, routines, relationships, reports,
   and activity events.
4. Convert `preferredWorkflowId`/template binding into workflow capability and
   routine-assignment rows. Remove the one-preferred-workflow contract.
5. Convert resolvable report recipients. Do not infer a real hierarchy from
   `reportsToLabel`; leave the reporting line unset until configured.
6. Update chat, Agent Hub, Autopilot, scheduler, workflow, task, and report entry
   points to call `AgentRuntime.startRun`.
7. Stop creating a new proactive thread per scheduled run.
8. Migrate the frontend to `/agents` and the new thread/run/activity interfaces.
9. Delete `/agent-strategies`, `run-now`, `run-workflow`, `report-now`, decoded
   `runHistory`, presentation-only hierarchy fields, and unused activity-feed
   adapters. No dual read/write or compatibility mode remains.

## Acceptance Criteria

- WHEN an operator hires an agent THE SYSTEM SHALL create one durable agent
  identity and one primary conversation in the same transaction.
- WHEN the operator chats with a hired agent across multiple sessions THE SYSTEM
  SHALL retain the same `agentId`, capability policy, memory scope, and primary
  thread.
- THE SYSTEM SHALL permit an agent to hold zero, one, or many action, workflow,
  and skill grants independently.
- WHEN a recurring routine is configured THE SYSTEM SHALL associate the agent
  and workflow through an `AgentRoutineAssignment`, not make the workflow the
  agent's identity.
- WHEN any user, schedule, event, webhook, agent, or system entry point starts
  agent work THE SYSTEM SHALL create one tenant-scoped `AgentRun` through the
  shared runtime.
- WHEN an agent invokes a workflow THE SYSTEM SHALL link its run to the exact
  immutable `WorkflowExecution` version and preserve both identities.
- WHEN a run changes state THE SYSTEM SHALL durably append a privacy-safe
  activity event and make it replayable after the operator reconnects.
- WHEN the Fleet view opens after 24 hours away THE SYSTEM SHALL reconstruct all
  authorized agent activity from persisted events without relying on missed
  WebSocket messages.
- WHEN a run is active, blocked, or waiting for human input THE SYSTEM SHALL
  project that status onto the agent and Fleet views in realtime.
- WHEN an action requires a social identity THE SYSTEM SHALL use an exact
  credential assignment or an explicit fan-out assignment and SHALL never
  silently select the first platform credential.
- WHEN one agent delegates to another THE SYSTEM SHALL enforce an explicit
  delegation grant, preserve parent/child run lineage, and SHALL NOT expand
  either agent's authority.
- WHEN a reporting line targets another agent THE SYSTEM SHALL reject
  self-reference and cycles.
- WHEN a report is generated THE SYSTEM SHALL persist its source runs,
  recipients, primary-thread check-in, and delivery outcome.
- THE SYSTEM SHALL expose no hidden reasoning, credential secret, or prompt text
  in Fleet activity, telemetry, or reports.
- AFTER the client migration THE SYSTEM SHALL have one hired-agent resource and
  SHALL remove the parallel `AgentStrategy` public API.

## Test Plan

- Migration tests for ID-preserving strategy promotion, primary-thread creation,
  proven metadata backfill, routine conversion, and unresolved reporting labels.
- Controller/DTO/serializer contract tests for every new route, pagination,
  optimistic versions, OpenAPI, status codes, and standard errors.
- Tenant tests proving organization/soft-delete filters and cross-brand,
  cross-credential, cross-agent, and cross-thread denial.
- Runtime contract tests for capability intersection, idempotency, budgets,
  approvals, input suspension/resume, cancellation, and terminal projection.
- Action/workflow tests proving one canonical executor path and immutable
  workflow-version provenance.
- Multi-account tests for exact credential selection, explicit fan-out, expired
  credentials, and ambiguous-account failure.
- Delegation tests for grant enforcement, authority intersection, cycles,
  budgets, parent/child results, and failure propagation.
- Event/outbox tests for atomicity, deduplication, ordered cursors, reconnect
  replay, cursor expiry, WebSocket fan-out, and privacy-safe payloads.
- Reporting tests for scheduled/manual generation, real recipients, primary
  thread check-ins, delivery outcomes, and no prompt/reasoning leakage.
- Frontend tests for hire → chat, live working state, Needs You, 24-hour replay,
  per-agent history, account/capability management, reports, and AFK recovery.
- PR CI owns typechecks, tests, builds, migration validation, and E2E execution
  on the MacBook-restricted development host.

## Related Decisions

See
[decisions-agent-fleet-runtime-api.md](decisions-agent-fleet-runtime-api.md).

This specification preserves the workflow-only action execution and
workflow-backed scheduling rules while superseding the one-preferred-workflow
identity and presentation-only reporting hierarchy in
`project_agent_workflow_run.md`.
