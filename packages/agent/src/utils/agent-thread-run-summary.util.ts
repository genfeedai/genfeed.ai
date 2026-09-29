import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { MappedSnapshotRunStatus } from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import type { AgentThreadStatusEvent } from '@genfeedai/contracts/interfaces';

type RunSummaryPatch = Pick<
  AgentThread,
  'attentionState' | 'pendingInputCount' | 'runStatus' | 'runtimeState'
>;

/**
 * Translates a definite local run status of the open thread into the thread
 * summary fields the sidebar reads. Returns `null` when the status carries no
 * information about the run, or when the summary already says the same.
 *
 * `idle` and `restoring` never produce a patch: the store resets the open
 * thread to `idle` on every switch before its snapshot lands, so `idle` means
 * "not hydrated yet", not "finished". A terminal status never overwrites a
 * summary that is waiting on the user (that only resolves through `running`).
 * `interrupted` maps to `cancelled`, as the server's legacy run status does.
 */
export function resolveRunSummaryPatch(
  status: MappedSnapshotRunStatus,
  thread: AgentThread,
): RunSummaryPatch | null {
  let patch: RunSummaryPatch;

  switch (status) {
    case 'running':
    case 'cancelling':
      patch = {
        attentionState: null,
        pendingInputCount: 0,
        runStatus: 'running',
        runtimeState: 'running',
      };
      break;
    case 'awaiting_input':
    case 'awaiting_confirmation':
      patch = {
        attentionState: 'needs-input',
        pendingInputCount: Math.max(1, thread.pendingInputCount ?? 0),
        runStatus: 'waiting_input',
        runtimeState: status,
      };
      break;
    case 'completed':
    case 'failed':
    case 'cancelled':
    case 'interrupted':
      if (thread.runStatus === 'waiting_input') {
        return null;
      }
      patch = {
        attentionState: null,
        pendingInputCount: thread.pendingInputCount,
        runStatus: status === 'interrupted' ? 'cancelled' : status,
        runtimeState: status,
      };
      break;
    default:
      return null;
  }

  // Only fill in what the summary disagrees on. A writer that already agreed
  // on the run status (stream events set `attentionState: 'running'` for the
  // same run) keeps its own write, so its update stays a single store change.
  const isUnchanged =
    patch.runStatus === 'running'
      ? (thread.runStatus === 'queued' || thread.runStatus === 'running') &&
        (thread.pendingInputCount ?? 0) === 0
      : patch.runStatus === thread.runStatus;

  return isUnchanged ? null : patch;
}

/**
 * The thread summary fields a pushed status event sets (#5636). The server
 * derives the event's state with the same function as the thread list, so this
 * mirrors the list's `attentionState` rule: Working while running, Needs you
 * while waiting. A client-side `updated` marker survives a terminal status, as
 * it would across a list reload it was not cleared by.
 */
export function resolveStatusPushPatch(
  event: Pick<
    AgentThreadStatusEvent,
    'pendingInputCount' | 'runStatus' | 'runtimeState' | 'sequence'
  >,
  thread: Pick<AgentThread, 'attentionState'>,
): Pick<
  AgentThread,
  | 'attentionState'
  | 'pendingInputCount'
  | 'runStatus'
  | 'runtimeState'
  | 'statusSequence'
> {
  const isWaiting = event.runStatus === 'waiting_input';
  const isRunning =
    event.runStatus === 'running' || event.runStatus === 'queued';

  return {
    attentionState: isWaiting
      ? 'needs-input'
      : isRunning
        ? 'running'
        : thread.attentionState === 'updated'
          ? 'updated'
          : null,
    pendingInputCount: event.pendingInputCount,
    runStatus: event.runStatus,
    runtimeState: event.runtimeState,
    statusSequence: event.sequence,
  };
}
