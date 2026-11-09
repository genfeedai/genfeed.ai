# Agent chat stream phases

The agent chat stream (`packages/agent/src/hooks/agent-chat-stream.*`) follows
one run per thread. Its state lives in refs, counters and flags on the thread's
`AgentStreamEntry`, not in one value. This page names the phases those fields
encode, the events that move between them, and the guards that keep a stale
owner from changing a newer one (#9737).

`deriveAgentStreamPhase` (`agent-chat-stream.phase.ts`) reads the phase from
the entry. `agent-chat-stream.phase.spec.ts` drives a real stream controller
through each path below and checks the phase after every step.

## Phases

The first row that matches wins.

| Phase | Entry fields | Meaning |
|---|---|---|
| `terminal` | `terminalAt !== null` | The run settled (done, error, recovery, abandon). Handlers and buffered events are cleared. The entry is kept for hydration guards and pruned after 5 minutes or past 50 terminal entries. |
| `awaiting_run_id` | `isAwaitingRunIdRef` | A send or an input handoff is waiting for the server to name the run. Events for the thread are buffered, not applied. |
| `stalled` | `stream.isRunStalled` | Completion polling stopped: the execution lookup returned 404 three times in a row after the grace period while the snapshot still says running. The user can resume or abandon. |
| `streaming` | `pendingCompletionRef !== null` | The run is known. Events stamped with that run id are applied. The completion watchdog polls every 10 seconds and recovers the reply from messages once the stream goes quiet. |
| `awaiting_input` | `pendingInputRequest !== null` | The run asked the user a question. The watchdog is off. Only the visible thread's presentation store holds the request, so a hidden thread waiting for input reads as `idle`. |
| `idle` | none of the above | No run is followed. |

"Sending", "handoff", "completing" and "restoring" from the issue are not
phases of their own:

- **Sending** and **handoff** are both `awaiting_run_id`. A send resets the run
  to idle and clears the transcript stream; a handoff keeps the asking run's
  messages and remembers its pending completion.
- **Completing / polling** is `streaming` with the watchdog firing.
- **Restoring** happens when a controller is created for a thread whose
  presentation store already says it is streaming (from a snapshot). It
  rebuilds the pending completion from the active run and goes straight to
  `streaming`.

## Events

| From | Event | To | Code |
|---|---|---|---|
| `idle`, `terminal` | `sendMessage` | `awaiting_run_id` | `entry.ts` `sendMessage` |
| `awaiting_run_id` | turn acknowledged (`chatStream` resolves) | `streaming` | `sendMessage`, then buffered events are replayed |
| `awaiting_run_id` | request fails or is aborted | `terminal` | `sendMessage` catch → `releaseCompletedSubscriptions` |
| `streaming` | `agent:token`, `agent:tool_*`, `agent:work_event` | `streaming` | `subscriptions.ts`; each touches the watchdog |
| `streaming` | `agent:done`, `agent:error` | `terminal` | `subscriptions.ts` → `cleanupSubscriptions` |
| `streaming` | `agent:done` while a queued ui-action run is pending | `streaming` (next run) | `followNextQueuedUiActionRun` |
| `streaming` | `agent:input_request` | `awaiting_input` | `subscriptions.ts`; clears the pending completion |
| `awaiting_input` | `beginRunHandoff` | `awaiting_run_id` | `entry.ts`; bumps `ownerGeneration` |
| `awaiting_run_id` | `adoptRun` | `streaming` | `entry.ts`; only for the handoff's generation |
| `awaiting_run_id` | `cancelRunHandoff` with a buffered continuation | `streaming` | adopts the continuation's run |
| `awaiting_run_id` | `cancelRunHandoff` with the failed request | `awaiting_input` | puts the request back |
| `awaiting_run_id` | `cancelRunHandoff` with nothing pending | `terminal` | settles the entry |
| `streaming` | watchdog finds the reply in messages | `terminal` | `completion.ts` `resolveStreamFromMessages` |
| `streaming` | grace period (90 s) passes with no reply and the run is gone | `terminal` (failed) | `completion.ts` |
| `streaming` | three 404 execution lookups after the grace period | `stalled` | `markRunStalled` |
| `stalled` | `resumeRunWatch` | `streaming` | resets the 404 count |
| any | `abandonRun` | `terminal` | drops the watchdog and subscriptions, keeps the transcript |
| `streaming` | event buffer over 2,048 events or 1 MiB | `streaming` (needs reconciliation) | `needsReconciliation`; the next watchdog tick reloads the snapshot instead of replaying |

## Ownership guards

These are not phases. They stop an older owner from writing over a newer one,
and they stay outside any reducer because they compare identities across
awaits:

- `ownerGeneration` increases on every send, handoff and adoption. A stale
  acknowledgement, aborted request or old watchdog compares its captured
  generation and does nothing.
- `isCurrentAgentStreamEntry(entry)` is false once a newer entry owns the
  thread key.
- `activeStreamRunIdRef` drops events stamped with another run id, so a slow
  earlier run cannot revive Stop or leak tokens into the current turn.
- `revision` counts applied events, so a hydration that read an older snapshot
  is discarded (`captureAgentStreamHydration`).

## Next step

The phases above are derived, not stored. Moving them into a reducer (step 3
of #9737) changes when the Stop button, the stall notice and the sidebar run
status update, so it needs the browser multistream test and a two-tab run on
one thread in a preview environment before it merges.
