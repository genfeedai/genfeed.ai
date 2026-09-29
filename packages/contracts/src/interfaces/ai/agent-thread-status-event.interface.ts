import type { AgentRuntimeState } from '../../enums/agent-runtime-state.enum';

/** Run status exactly as the thread list reports it in `runStatus`. */
export type AgentThreadRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'idle';

/**
 * The status-bearing slice of a thread summary: the fields the sidebar reads
 * to show Working / Needs you / idle. The thread list and the status push both
 * derive it from one server function, so they cannot disagree.
 */
export interface AgentThreadRunState {
  pendingInputCount: number;
  runStatus: AgentThreadRunStatus;
  runtimeState: AgentRuntimeState;
}

/**
 * One thread's run status changed (#5636). Published on the `agent-chat`
 * channel as `{ type: 'agent:thread_status', data }` and delivered only to the
 * thread owner's sockets authenticated for `organizationId`.
 *
 * `sequence` is the thread's own event sequence (`lastSequence` of its
 * snapshot) at the moment the state was read. It is the same per-thread
 * sequence `agent:done` / `agent:error` carry, so a client can order a status
 * push against a live stream it owns.
 */
export interface AgentThreadStatusEvent extends AgentThreadRunState {
  organizationId: string;
  sequence: number;
  threadId: string;
  timestamp: string;
  userId: string;
}
