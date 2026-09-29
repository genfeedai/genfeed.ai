import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { MappedSnapshotRunStatus } from '@genfeedai/agent/utils/agent-thread-snapshot.util';

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

  const isUnchanged =
    patch.attentionState === (thread.attentionState ?? null) &&
    patch.pendingInputCount === thread.pendingInputCount &&
    patch.runStatus === thread.runStatus &&
    patch.runtimeState === thread.runtimeState;

  return isUnchanged ? null : patch;
}
