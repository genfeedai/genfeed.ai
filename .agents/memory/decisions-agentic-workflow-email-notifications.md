---
name: Agentic workflow email notification decisions
description: Use a transactional notification outbox with durable preferences and Resend delivery state.
type: project
status: active
last_verified: 2026-08-22
topics: [agent, workflows, notifications, email, outbox, resend]
---

# Agentic Workflow Email Notification Decisions

## Optimization Target

Guarantee that every persisted workflow terminal result has a recoverable,
auditable notification outcome without coupling workflow success to an external
email provider. Make later notification topics and channels additive rather
than another redesign.

## Considered Approaches

1. **Patch the current terminal publisher.** Reuse the personal boolean and
   Redis email event, add missing call sites, and fix the idempotency key.
   - Lowest implementation cost.
   - Still has no atomic event, delivery history, replay, lease recovery,
     preference catalog, or provider acknowledgement.
   - Rejected as the short-term repair that would be rebuilt for broader
     agentic notifications.
2. **Transactional notification outbox and preference catalog** (chosen).
   - Atomically records the event/delivery with terminal execution state.
   - Supports typed topics, channels, durable retry, provider ids, audit, and
     crash recovery.
   - Requires new persistence, queue/worker, preference API, migration, and UI.
3. **Per-workflow notification nodes/configuration.** Let each workflow choose
   recipients and channels.
   - Useful later as an override.
   - Cannot report failures before the node runs and forces notification policy
     into every graph.
   - Rejected as the platform foundation.

## Decision

Use approach 2 and deliver it end to end. `workflow.execution.completed` and
`workflow.execution.failed` are the first typed events; `workflow.status` /
`email` is the first preference. The model is intentionally general enough for
agent-run, review, publish, credit, Slack, Telegram, and push topics later, but
this change wires only real events that have real producers and consumers.

## Ownership

- The workflow's canonical Prisma `Workflow.userId` owns workflow-status email.
- The execution actor remains event context but does not replace the workflow
  owner as recipient.
- Delivery resolves the owner's current canonical `User.email` and requires
  `isDeleted: false`.
- Notification events/deliveries retain `organizationId`; preference rows are
  personal across the user's account, matching the existing personal toggle.

## Atomicity and Recovery

- Graph terminal persistence and outbox creation share one Prisma transaction.
- Event `deduplicationKey` is source run + event key.
- Delivery uniqueness is event + recipient + channel.
- Queue scheduling happens after commit. Failure to enqueue is tolerated because
  the relay scans durable pending/retry/lease-expired deliveries.
- Worker claim uses a lease so duplicate jobs and crashed workers do not deliver
  concurrently forever.

## Delivery Boundary

- The outbox worker calls the notifications service's authenticated internal
  email-delivery endpoint and waits for Resend acceptance.
- The provider id is persisted as evidence of acceptance; mailbox delivery,
  bounce, open, and click are not claimed.
- Workflow state never changes in response to provider failure.
- The legacy Redis `workflow_status_email` side effect is retired from the
  workflow path to prevent dual delivery.

## Preference Boundary

- A normalized preference row replaces the workflow boolean; missing is
  disabled.
- Migration backfills enabled users before dropping the legacy workflow field.
- API access is current-user-only and serializer-backed.
- Per-workflow overrides may be layered later by resolving override → personal
  default, but are not mixed into the first durable foundation.

## Rejected Assumptions

- A rendered email handler is not an end-to-end feature unless every terminal
  producer reaches it.
- Redis acceptance is not provider acceptance or durable delivery evidence.
- A workflow id is not a run id.
- The execution actor is not always the workflow owner.
- Adding unused event names is not a useful event catalog; new keys ship with a
  producer, preference policy, delivery behavior, and tests.
