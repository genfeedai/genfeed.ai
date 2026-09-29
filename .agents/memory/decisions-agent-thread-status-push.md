---
last_verified: 2026-09-29
---

# Agent thread status push (#5636)

The server pushes each thread's run status to the sidebar; the client never derives it from streams it happens to hold.

- **Transport:** the existing `agent-chat` Redis channel, event `agent:thread_status` (`AgentThreadStatusEvent`, `packages/contracts`). No second channel. The shared `WebSocketGateway` routes it.
- **Publish point:** `AgentThreadEngineService.appendEvent` (every thread event goes through it) via `AgentThreadStatusPublisherService`, only when the run state derived by `AgentThreadsService.resolveThreadRunState` (the thread list's own logic) differs before/after the event. Never per token. Archived or deleted threads are skipped.
- **Sequence:** the thread's event sequence (snapshot `lastSequence`). The thread list carries it as `statusSequence`, so a list response cannot regress a newer push.
- **Isolation:** delivered to room `org:<orgId>:user:<userId>`, joined only from the verified JWT organization claim. Owner-within-org on purpose: the thread list is per user. Self-hosted (`getDeploymentFromReader` = `self-hosted`) also reaches the owner's user room.
- **Recovery ends:** a run ended through its execution alone (reconcile worker: never started, never claimed, drained, or ancient) records a terminal thread event first (`AgentExecutionRecoveryEventService`), before the execution closes, or the push would not fire.
- **Client:** `useAgentThreadStatusPush` (one subscription per session): sequence-guarded apply, live-stream precedence, list reload on connect/reconnect. Focus and interval refetch run only while the channel is not connected (the push makes them redundant when it is); they remain the fallback.
- **Metrics:** Sentry counters `agent.thread_status.*` (server: published, publish_failed, delivered, dropped; client: received, applied, dropped_out_of_order, unknown_thread, reconnect_reload, fallback_refetch).
