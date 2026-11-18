# Agent chat stream phases

The agent chat stream (`packages/agent/src/hooks/agent-chat-stream.*`) follows
one run per thread. Each thread's `AgentStreamEntry` holds its phase in
`entry.phase`. Only `transitionAgentStreamPhase` changes it, through the pure
`reduceAgentStreamPhase` and the `AGENT_STREAM_PHASE_TRANSITIONS` table
(`agent-chat-stream.phase.ts`). Events for the thread are held while the
phase is `awaiting_run_id`; nothing else stores that fact (#9737).

Refs remain only for data and resources: the pending completion (run id,
start time, the replies seen before it), the event buffer, the abort
controller, the watchdog timer and the subscriptions. `terminalAt` is the time
the entry settled, used to prune old entries.

`deriveAgentStreamPhase` reads the phase back from those fields.
`agent-chat-stream.phase.spec.ts` drives a real stream controller through each
path below and checks after every step that the reducer's phase and the one
read back from the fields agree. It also has a table test of the reducer.

## Phases

The entry fields column is how `deriveAgentStreamPhase` reads the phase back.
The first row that matches wins.

| Phase | Entry fields | Meaning |
|---|---|---|
| `terminal` | `terminalAt !== null` | The run settled (done, error, recovery, abandon). Handlers and buffered events are cleared. The entry is kept for hydration guards and pruned after 5 minutes or past 50 terminal entries. |
| `awaiting_run_id` | `isAwaitingRunIdRef` | A send or an input handoff is waiting for the server to name the run. Events for the thread are buffered, not applied. |
| `stalled` | `stream.isRunStalled` | Completion polling stopped: the execution lookup returned 404 three times in a row after the grace period while the snapshot still says running. The user can resume or abandon. |
| `streaming` | `pendingCompletionRef !== null` | The run is known. Events stamped with that run id are applied. The completion watchdog polls every 10 seconds and recovers the reply from messages once the stream goes quiet. |
| `awaiting_input` | `pendingInputRequest !== null` | The run asked the user a question. The watchdog is off. Only the visible thread's presentation store holds the request, so reading the fields of a hidden thread waiting for input gives `idle`; `entry.phase` says `awaiting_input`. |
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

Each row raises one reducer event (in brackets). An event raised in a phase
the table in `AGENT_STREAM_PHASE_TRANSITIONS` does not list leaves the phase
as it is.

| From | Event | To | Code |
|---|---|---|---|
| `idle`, `terminal` | `sendMessage` [`send`] | `awaiting_run_id` | `entry.ts` `sendMessage` |
| `awaiting_run_id` | turn acknowledged (`chatStream` resolves) [`run_named`] | `streaming` | `sendMessage`, then buffered events are replayed |
| `awaiting_run_id` | request fails or is aborted [`hold_released`, `settle`] | `terminal` | `sendMessage` catch → `releaseCompletedSubscriptions` |
| `streaming` | `agent:token`, `agent:tool_*`, `agent:work_event` | `streaming` | `subscriptions.ts`; each touches the watchdog |
| `streaming` | `agent:done`, `agent:error` [`settle`] | `terminal` | `subscriptions.ts` → `cleanupSubscriptions` |
| `streaming` | `agent:done` while a queued ui-action run is pending [`run_named`] | `streaming` (next run) | `followNextQueuedUiActionRun` |
| `streaming` | `agent:input_request`, or `agent:done` with a question open [`input_requested`] | `awaiting_input` | `subscriptions.ts`; clears the pending completion |
| `awaiting_input` | `beginRunHandoff` [`handoff`] | `awaiting_run_id` | `entry.ts`; bumps `ownerGeneration` |
| `awaiting_run_id` | `adoptRun` [`run_named`] | `streaming` | `entry.ts`; only for the handoff's generation |
| `awaiting_run_id` | `cancelRunHandoff` with a buffered continuation [`hold_released`, `run_named`] | `streaming` | adopts the continuation's run |
| `awaiting_run_id` | `cancelRunHandoff` with the failed request [`hold_released`, `input_requested`] | `awaiting_input` | puts the request back |
| `awaiting_run_id` | `cancelRunHandoff` with nothing pending [`hold_released`, `settle`] | `terminal` | settles the entry |
| `streaming` | watchdog finds the reply in messages [`settle`] | `terminal` | `completion.ts` `resolveStreamFromMessages` |
| `streaming` | grace period (90 s) passes with no reply and the run is gone [`settle`] | `terminal` (failed) | `completion.ts` |
| `streaming` | three 404 execution lookups after the grace period [`stall`] | `stalled` | `markRunStalled` |
| `stalled` | `resumeRunWatch` [`resume`] | `streaming` | resets the 404 count |
| any | `abandonRun` [`settle`] | `terminal` | drops the watchdog and subscriptions, keeps the transcript |
| live phases | `clearChat` [`reset`] | `idle` | `entry.ts`; the entry is disposed right after |
| `idle` | controller created while the snapshot says the run is streaming [`run_named`] | `streaming` | restore at the end of `createAgentStreamController` |
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

## Checking a change

The reducer decides when events are held, so a change to it or to where an
event is raised can change when the Stop button, the stall notice and the
sidebar run status update. Run the phase spec, the browser multistream test
(`agent-chat-stream.multistream.browser.test.tsx`) and a two-tab run on one
thread in a preview environment before merging.
