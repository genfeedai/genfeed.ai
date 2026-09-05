---
name: Agentic workflow email notifications
description: Durable notification events, preferences, delivery state, and Resend workflow-status email.
type: project
status: active
last_verified: 2026-09-05
topics: [agent, workflows, notifications, email, outbox, resend]
---

# Agentic Workflow Email Notifications Spec

**Why:** Genfeed exposes a workflow-email toggle and can render a workflow status
email, but the ordinary workflow terminal path does not reliably reach it. The
current Redis-only side effect also has no durable delivery record or replay
path, and its workflow-level idempotency key can suppress distinct runs.
**How to apply:** Persist a typed notification event and recipient delivery in
the same database transaction as the workflow terminal transition. Relay the
delivery through a recoverable queue, resolve the canonical workflow owner's
preference and email, await Resend provider acceptance through the notifications
service, and persist the outcome.

## Purpose

Build the long-term notification foundation and make workflow completed/failed
email work end to end for every workflow execution source. The first delivered
topic is workflow status email; the event, preference, queue, and delivery model
must support later agent, approval, publish, credit, and channel topics without
another architecture rewrite.

## Current-State Audit

- `Setting.isWorkflowNotificationsEmail` exists with a `false` default, is
  accepted by the API DTO/serializer, and is shown as a personal settings
  switch, although the shared `ISetting` contract omits it.
- `NotificationsPublisherService` conditionally publishes a
  `workflow_status_email` Redis event and the notifications service renders an
  escaped completed/failed Resend template.
- Ordinary node-graph terminal execution does not publish that status event.
  Delay-resume and legacy step paths do; review-gate and thrown-error paths are
  inconsistent; scheduled failure can publish twice.
- The Resend key is `workflow-status/{workflowId}/{status}` rather than a run
  identity, so distinct runs with the same terminal status can be deduplicated.
- Redis publication proves neither provider acceptance nor durable retry. There
  is no queryable notification event, delivery status, provider id, terminal
  failure, or recovery relay.
- `WorkflowExecutionsService.completeExecution` is already the canonical graph
  terminal transition and already emits the matching
  `workflow.execution.completed` / `workflow.execution.failed` webhook event.
- Workflow entry points converge on the graph executor for UI/API, agent tools,
  Agent Team runs, schedules, events, webhooks, batches, delay resume, and review
  resume. A still-active legacy step runner remains a separate execution path.

## Execution Source Map

| Source | Canonical execution path | Notification identity |
| --- | --- | --- |
| Workflow UI / public API / internal API | `executeManualWorkflow` | `WorkflowExecution.id` |
| Agent `execute_workflow` tool | scoped `executeManualWorkflow` | `WorkflowExecution.id` |
| Agent Team `run-workflow` | strategy run → `executeManualWorkflow` | `WorkflowExecution.id` |
| Scheduled graph workflow | scheduler → workflow executor | `WorkflowExecution.id` |
| Event/social/trend/reply automation | queued trigger → workflow executor | `WorkflowExecution.id` |
| Workflow webhook | webhook service → workflow executor | `WorkflowExecution.id` |
| Batch item | batch worker → workflow executor | Item `WorkflowExecution.id` |
| Delay resume | same persisted execution | Original `WorkflowExecution.id` |
| Review-gate resume | same persisted execution | Original `WorkflowExecution.id` |
| Legacy step workflow | legacy runner → canonical execution record | New `WorkflowExecution.id` |

Agent conversation turns now persist through hidden system workflows. Failed
agent conversation runs use the existing terminal outbox with source type
`agent_run` and delivery topic `agent.status`. The supported conversation
workflow IDs are centralized in `AGENT_CONVERSATION_WORKFLOW_IDS`; unrelated
hidden workflows do not inherit this policy. Tool calls that do not create or
continue a workflow execution do not emit a separate terminal email.

## Data Contracts

### Notification event

An immutable, tenant-scoped event contains:

- Typed `eventKey` such as `workflow.execution.completed` or
  `workflow.execution.failed`.
- Stable unique `deduplicationKey` derived from source run plus event key.
- `organizationId`, source type/id, actor/owner context, occurred time, and a
  versioned JSON payload containing only delivery-safe data.

### Notification preference

A personal preference contains:

- Canonical `users.id` owner.
- Typed topic such as `workflow.status` or `agent.status`.
- Channel such as `email`.
- Enabled state, defaulting to disabled when no preference row exists.

### Notification delivery

A tenant-scoped delivery contains:

- Event, recipient `users.id`, organization, channel, and provider.
- State: pending, processing, retry pending, delivered, skipped, or failed.
- Stable idempotency key, attempt count, next-attempt/lease timestamps,
  provider message id, delivered time, and redacted last error.
- A uniqueness constraint that prevents two deliveries for the same event,
  recipient, and channel.

## Interfaces

- Personal settings read and update typed notification preferences through the
  authenticated current-user boundary.
- **Workflow status emails** covers ordinary completed and failed workflow
  executions. **Agent run failure emails** independently controls failed agent
  conversation runs through `agent.status` / `email`, disabled by default.
- Only failed agent runs receive a classified `failure` payload containing
  reason, title, summary, recovery and retry/configuration flags. Raw `error`
  and `failure.detail` are null in that event. Agent emails render the safe
  classification and recovery text.
- Ordinary workflow outcomes keep source type `workflow_execution`, topic
  `workflow.status`, and the existing bounded error and workflow email body.
  Supplying classified data cannot switch those emails to agent wording.
  Completed agent runs retain the ordinary workflow outcome policy.
- The canonical graph terminal update writes its notification event/delivery
  atomically with the execution state.
- A queue service schedules committed deliveries; a recovery relay re-enqueues
  pending, retryable, or lease-expired deliveries after crashes.
- A worker claims one delivery, evaluates the current preference, resolves the
  canonical workflow owner's current non-deleted user email, builds the shared
  system email, and calls the authenticated notifications-service delivery
  endpoint.
- Provider acceptance returns a Resend email id which is persisted on the
  delivery. Provider rejection persists retry/failure state without rewriting
  the workflow result.
- Resend idempotency is based on the notification delivery identity and source
  run, never only on workflow id/status.

## Key Decisions

See
[decisions-agentic-workflow-email-notifications.md](decisions-agentic-workflow-email-notifications.md).

## Preference Migration

- Existing users with `isWorkflowNotificationsEmail = true` are backfilled to
  an enabled `workflow.status` / `email` preference.
- Missing preference means disabled.
- The workflow boolean is removed from `Setting`, its DTO/serializer/client
  declarations, and the UI after backfill; the new preference row is the only
  source of truth.
- Existing video and trend notification behavior remains intact in this PR.

## Edge Cases and Failure Modes

- Running, delayed, review-pending, and cancelled executions create no terminal
  workflow-status delivery.
- Repeating the same terminal transition or queue job reuses one event/delivery;
  a different workflow run gets a different event/delivery.
- Queue publication failure after commit is recovered by the relay.
- A worker crash leaves a lease that the relay can reclaim after expiry.
- Disabled preference, deleted/missing user, or missing email marks delivery
  skipped with a machine-readable reason.
- Retryable provider/transport failures back off to a bounded attempt count;
  permanent or exhausted failures remain queryable as failed.
- Notification delivery failure never changes a persisted completed workflow to
  failed, or a persisted failed workflow to completed.
- Workflow label and failure text are escaped/redacted and length-bounded before
  entering email or delivery diagnostics.
- Self-hosted deployments without configured Resend retain the delivery as a
  diagnosed failure rather than silently reporting success.

## Acceptance Criteria

- WHEN a workflow execution reaches `COMPLETED` THE SYSTEM SHALL atomically
  persist one `workflow.execution.completed` notification event and one email
  delivery addressed to the canonical workflow owner.
- WHEN a workflow execution reaches `FAILED` THE SYSTEM SHALL atomically persist
  one `workflow.execution.failed` notification event and one email delivery
  addressed to the canonical workflow owner.
- WHEN the workflow owner has enabled `workflow.status` email THE SYSTEM SHALL
  deliver one escaped workflow-status email through Resend and persist the
  provider email id.
- WHEN the workflow owner has disabled `workflow.status` email THE SYSTEM SHALL
  send no email and SHALL persist the delivery as skipped.
- THE SYSTEM SHALL apply the same terminal event policy to manual, API,
  agent-tool, Agent Team, scheduled, event, webhook, batch, delayed-resume,
  review-resume, and legacy workflow runs.
- WHEN a workflow is running, delayed, awaiting review, or cancelled THE SYSTEM
  SHALL NOT create a completed or failed workflow-status event.
- WHEN queue publication fails after event commit THE SYSTEM SHALL recover and
  re-enqueue the durable pending delivery.
- WHEN a retry repeats the same event THE SYSTEM SHALL reuse the existing
  event/delivery and provider idempotency key.
- WHEN a different run of the same workflow reaches the same status THE SYSTEM
  SHALL create and deliver a distinct notification.
- WHEN provider delivery fails THE SYSTEM SHALL preserve the workflow terminal
  state and SHALL persist bounded retry or final failure diagnostics.
- THE SYSTEM SHALL expose an accessible personal **Workflow status emails**
  toggle backed only by the notification preference model.

- WHEN an agent conversation run fails THE SYSTEM SHALL atomically persist its
  terminal notification with source `agent_run` and topic `agent.status`,
  retaining the run-based deduplication and provider idempotency keys.
- WHEN the owner has not enabled agent failure email THE SYSTEM SHALL skip
  that delivery independently of the workflow-status preference.
- THE SYSTEM SHALL send classified agent failure copy without raw diagnostics
  only for failed agent runs and preserve ordinary workflow email behavior.

## Test Plan

- Migration structural test for models, tenant/soft-delete fields, unique keys,
  recovery indexes, preference backfill, and legacy workflow setting removal.
- Event catalog tests for supported keys/topics/channels and safe payloads.
- Outbox service tests for atomic create/upsert, owner routing, deduplication,
  disabled defaults, and transaction reuse.
- Workflow execution tests for ordinary, thrown-error, delayed, review,
  scheduled, batch, agent-origin, and legacy terminal paths.
- Queue/relay/worker tests for claim exclusivity, lease recovery, retry backoff,
  skip reasons, idempotency, provider acceptance, and exhausted failures.
- Notifications-service tests for authenticated Resend acknowledgement and safe
  provider error propagation.
- API serializer/controller/service tests for current-user preference reads and
  writes without cross-user access.
- UI tests for loading, enable, disable, optimistic rollback, and accessible
  switch labeling.
- PR CI owns package tests, typechecks, builds, migration validation, and
  integration gates on the MacBook-restricted development host.
