---
name: Agent fleet runtime API decisions
description: Agent is the durable identity; workflows, actions, skills, accounts, memory, and delegation are capabilities behind one runtime
type: project
status: proposed
last_verified: 2026-08-31
topics: [agent, api, workflows, actions, skills, memory, automation, realtime, fleet]
---

# Agent Fleet Runtime API Decisions

## Decision Summary

Make the hired `Agent` the durable product identity and the `AgentRuntime` the
single execution seam. Conversations, scheduled work, actions, workflows,
skills, connected accounts, memory, delegation, reports, and activity all join
through `agentId` and `AgentRun`.

A workflow is a deterministic routine capability, not the agent. The agent may
use many workflows or none. New recurring automation remains workflow-backed,
and product actions still execute through action-backed workflow nodes, but the
operator chats with and manages an agent identity rather than a workflow
wrapper.

## Approaches Considered

### 1. Keep AgentStrategy Bound To One Preferred Workflow

This is the current Team model: hire a role, bind a preferred workflow, fill its
inputs, and run it.

Advantages:

- predictable content production;
- typed workflow inputs and deterministic execution;
- low ambiguity in the “Run workflow” button.

Rejected as the agent model because it conflates worker identity with one
routine. It cannot naturally support a persistent bot conversation, multiple
routines, ad-hoc actions, research, memory, delegation, account-specific work,
or a coherent cross-run report. Adding capabilities would keep growing strategy
configuration around the wrong center.

### 2. Make AgentThread The Agent

This produces the fastest Grok-like UI: each thread appears to be a bot and the
LLM tool loop does everything.

Advantages:

- conversation-first experience;
- reuses existing streaming, messages, tools, and memory;
- minimal new persistence.

Rejected because a thread is a conversation, not a worker. Multiple threads
would duplicate identity and policy; schedules would need a synthetic thread;
budgets, routines, account grants, reports, and delegation would have nowhere
stable to live. Archiving a conversation must not fire or delete an employee.

### 3. Durable Agent Identity With Capability Runtime (Chosen)

The agent owns identity and policy; threads own conversations; runs own units of
work; workflows own deterministic graphs; actions own atomic capabilities;
skills own procedural guidance; assignments own resource authority; events own
Fleet replay.

This creates a deep module at one interface:

```typescript
AgentRuntime.startRun(agentId, request, actorContext)
```

Deleting that module would force capability resolution, authorization,
idempotency, budgeting, event emission, workflow/action dispatch, suspension,
and reporting back into every controller, scheduler, worker, and WebSocket
handler. That is the leverage and locality this seam must provide.

## Why The Agent Was Attached To A Workflow

The binding was introduced for the deterministic content-Team path. A role such
as Social Media Manager should repeatedly produce through a reviewed graph,
with stable inputs and no LLM improvisation over pipeline construction. The
workflow supplies:

- immutable executable versions;
- typed input slots;
- deterministic sequence and control flow;
- idempotency and external-side-effect safety;
- retries, delay/review resume, and cancellation;
- approval nodes;
- progress, credit usage, node logs, and failure attribution;
- one canonical target for scheduling.

Those reasons remain correct. The overly narrow part was putting a single
`preferredWorkflowId` on the agent and making “Run workflow” its primary
identity. Predictable execution does not require identity coupling.

## Workflow Relationship Decision

Use `AgentRoutineAssignment` for scheduled/repeatable work and
`AgentCapabilityGrant(kind=workflow)` for authorization.

```text
Agent ── capability grant ──> may invoke Workflow
Agent ── routine assignment ──> should run Workflow on trigger/schedule
AgentRun ── provenance ──> did invoke WorkflowExecution version N
```

This separates three different questions that one preferred-workflow field
incorrectly answered at once:

1. Is the agent allowed to use this workflow?
2. Should the workflow run automatically under this agent?
3. Which exact workflow execution did this unit of work produce?

Direct chat does not become a workflow graph. When the agent needs product
behavior, it selects from its effective curated actions/workflows. Under the
existing workflow-only action rule, the selected action reaches the canonical
action-backed workflow executor; the user is not forced to understand or bind
the bot to that implementation detail.

## Conversation Decision

Every hired agent gets one primary `AgentThread` at hire time and may own more
threads. `AgentThread.agentId` is mandatory for hired-agent conversations.

Scheduled work creates an `AgentRun`, not a new identity or disposable
conversation. A configured completion/check-in is posted to the primary thread,
so opening the agent feels like returning to the same colleague.

General assistant threads may remain agentless as a separate product concept.
They cannot masquerade as hired agents.

## Capability Decision

Do not encode an agent's capabilities in `agentType`, prompt text, a workflow
template, or an arbitrary JSON config. Use normalized, validated grants:

- actions reference the curated action catalog;
- workflows reference tenant-authorized workflows and optional versions;
- skills reference installed/authorized skills and optional versions;
- account and other resource access use separate assignments.

`agentType` becomes a hire preset for defaults and persona, not an authorization
switch. The runtime computes and freezes the effective capability set on each
run for auditability.

## Account Assignment Decision

An agent may work for a brand but still needs explicit social identity rules.
Store exact `credentialId` assignments or explicit platform-fan-out
assignments. Never treat the platform list on the agent as account identity.

This preserves the multi-account contract:

- acting as one account is credential-specific;
- publishing to every account is an explicit fan-out policy;
- ambiguous platform-only identity fails closed;
- credentials stay rows with server-side secrets, not capability payloads.

## Run And Provenance Decision

Introduce `AgentRun` as the common unit of work across chat, action, workflow,
delegation, and report execution.

Do not replace `WorkflowExecution`. The two models answer different questions:

- `AgentRun`: what did this hired agent attempt, for whom, under which
  capabilities/budget, and what was the result?
- `WorkflowExecution`: which immutable graph version and nodes executed, with
  what progress/results?

Link them one-to-zero-or-one. This makes Fleet agent-centric without weakening
workflow observability.

## Fleet Activity Decision

Use a durable append-only `AgentActivityEvent` projection with a monotonic
organization cursor. REST supplies replay; WebSocket supplies low-latency
delivery. Redis/WebSocket events alone are insufficient because they cannot
answer “what happened while I was away?”

Do not stretch the existing generic `Activity` record into the source of truth.
It was designed for broad product events, not ordered agent run/action/workflow
lineage. Selected fleet events may project into Workspace Activity for
awareness.

Fleet events contain operational facts and safe summaries only. Hidden
reasoning, raw prompts/completions, and credential secrets stay out, preserving
the prompt-moderation and telemetry stance.

## Reporting Decision

Replace `reportsToLabel` with a real reporting relationship. An agent reports to
one user or agent; reports may have additional user recipients. Reporting-line
cycles fail closed.

Report generation is an `AgentRun(kind=report)`. A durable `AgentReport` links
the source runs/artifacts, recipients, primary-thread check-in, and notification
delivery outcome. A backend report row without a visible timeline or delivery
result is not an end-to-end reporting feature.

## Delegation Decision

Delegation requires an explicit source-agent → target-agent grant. It creates a
child run and freezes the intersection of source authority, target authority,
actor authority, resource assignments, budget, and approval policy.

The target agent never inherits broader permissions merely because another
agent requested the work. Parent/child run IDs make delegation visible in both
bot conversations and Fleet.

## Scheduling Decision

Recurring work remains workflow-backed. The scheduler targets an enabled
`AgentRoutineAssignment`, resolves its published workflow version, and starts
the work through `AgentRuntime`.

This preserves one scheduling/execution engine while correcting ownership:

- the workflow is the canonical scheduled executable;
- the agent is the canonical worker identity;
- the routine assignment is the canonical relationship between them;
- the agent run is the canonical operator-facing provenance.

Generic “wake the LLM every N minutes and let it decide anything” scheduling is
rejected because it weakens idempotency, approvals, cost predictability,
debuggability, and operator control.

## Authorization Decision

Agents are not users and receive no independent authentication tokens. A run
records both `agentId` and actor provenance. Interactive runs use the current
authenticated user. Scheduled/system runs use a system actor plus validated
agent ownership/configuration.

Capabilities are an additional restriction, never an elevation over the human,
organization, deployment, or resource authorization model. If the owner is
removed or the credential/workflow becomes unavailable, the run fails closed
or the routine pauses with an attention event.

## API Shape Decision

- `/v1/agents` is the single hired-agent resource namespace.
- JSON:API serializers remain the resource envelope.
- Cursor pagination is used for runs, messages, reports, and activity streams.
- Creating work means creating an `AgentRun`; asynchronous acceptance returns
  `202` with that resource.
- Closed discriminated DTOs describe objective/action/workflow/delegation/report
  requests.
- Capability/account/resource/delegation replacements use array-only `PUT`
  interfaces with optimistic versions.
- Realtime event delivery is additive to durable REST replay.
- OpenAPI documents HTTP; it does not generate or define agent-tool parity.

## Migration Decision

Use a hard cut after the frontend and runtime callers are migrated:

- preserve `AgentStrategy` IDs while promoting the model to `Agent`;
- backfill only relationships proven by IDs/metadata;
- never convert `reportsToLabel` into authority by matching display text;
- convert preferred workflow binding into grants/routines;
- stop per-run proactive thread creation;
- remove strategy-specific run/report verb endpoints and decoded JSON run
  history;
- delete the old public namespace after all callers use `/agents`.

Dual identities, dual writes, and a permanent strategy compatibility layer are
rejected because they would make every later capability and Fleet query handle
two sources of truth.

## Consequences

- The implementation is larger than adding a Chat button to Agent Hub because
  the identity/provenance seam must be corrected first.
- Existing chat streaming, thread events, action catalog, workflow executor,
  schedules, credentials, approvals, tasks, and reports are reused behind the
  new runtime rather than rebuilt.
- The agent detail page becomes a real worker home: conversation, status,
  current work, history, capabilities, accounts, routines, reports, usage, and
  attention.
- Fleet/Mission Control can answer both “what is happening now?” and “what
  happened in the last 24 hours?” from one durable event contract.
- Workflows keep their deterministic strengths without limiting what an agent
  can be.

## Superseded Assumptions

- A content agent's primary identity is its preferred workflow.
- A platform array identifies the social accounts an agent acts as.
- `reportsToLabel` establishes a reporting relationship.
- A new proactive thread per run represents a durable bot.
- Strategy JSON `runHistory` is sufficient fleet provenance.
- Redis/WebSocket delivery alone is sufficient activity history.

## Related Architecture

- `spec-workflow-only-action-execution.md`
- `decisions-workflow-only-action-execution.md`
- `architecture/ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md`
- `architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md`
- `architecture/ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md`
- `architecture/ADR-PROMPT-MODERATION-STANCE.md`
- `spec-multi-account-per-platform.md`
- `curated_agent_mcp_actions.md`
