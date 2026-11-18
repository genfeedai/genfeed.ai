---
last_verified: 2026-09-29
---

# Agent thread status push (#5636)

The server pushes each thread's run status to the sidebar; the client never derives it from streams it happens to hold.

- **Transport:** the existing `agent-chat` Redis channel, event `agent:thread_status` (`AgentThreadStatusEvent`, `packages/contracts`). No second channel. The shared `WebSocketGateway` routes it.
- **Publish point:** `AgentThreadEngineService.appendEvent` (every thread event goes through it) via `AgentThreadStatusPublisherService`, only when the run state derived by `AgentThreadsService.resolveThreadRunState` (the thread list's own logic) differs before/after the event. Never per token. Archived or deleted threads are skipped.
- **Sequence:** the thread's event sequence (snapshot `lastSequence`). The thread list carries it as `statusSequence`, so a list response cannot regress a newer push.
- **Isolation:** delivered to rooms `org:<orgId>:user:<userId>`, joined only from the verified JWT organization claim. Since #9938 the audience is every member with live access to the thread (owner plus live shares), resolved in the API by `AgentThreadAudienceService` through `AgentThreadAccessService.hasAccess` and carried as `recipientUserIds` on the event; the gateway only routes by it and strips it before emit. The same audience applies to every thread-scoped stream event (`AgentStreamPublisherService`). Self-hosted (`getDeploymentFromReader` = `self-hosted`) also reaches each member's user room.
- **Revoking access (#9938):** the audience is cached 5 s per process. Removing a share refreshes it and publishes `agent:thread_access_revoked` to each member who dropped out (client closes the thread and drops the row); the gateway also refuses that member's events for the thread for 10 s, so another process holding an older audience cannot reach them. Loss of a role, membership or brand assignment carries no hook and takes effect within the 5 s cache.
- **Recovery ends:** a run ended through its execution alone (reconcile worker: never started, never claimed, drained, or ancient) records a terminal thread event first (`AgentExecutionRecoveryEventService`), before the execution closes, or the push would not fire.
- **Client:** `useAgentThreadStatusPush` (one subscription per session): sequence-guarded apply, live-stream precedence, list reload on connect/reconnect. Focus and interval refetch run only while the channel is not connected (the push makes them redundant when it is); they remain the fallback.
- **Metrics:** Sentry counters `agent.thread_status.*` (server: published, publish_failed, delivered, dropped; client: received, applied, dropped_out_of_order, unknown_thread, reconnect_reload, fallback_refetch).
