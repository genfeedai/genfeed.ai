import type {
  AgentRunVocabularyRow,
  AgentThreadRunStatus,
} from '../interfaces/ai/agent-thread-status-event.interface';
import { AgentRuntimeState } from './agent-runtime-state.enum';
import { AgentTransferStatus } from './agent-transfer.enum';
import {
  isWorkflowExecutionStatus,
  WorkflowExecutionStatus,
} from './workflow.enum';

/**
 * An agent turn's durable status in each vocabulary it is shown in (#9738):
 * the product runtime state, the thread list `runStatus`, and the agent
 * transfer projection. Persisted values are unchanged; this table is the one
 * place they are mapped. Legacy snapshot spellings (`queued`,
 * `waiting_input`) are read only by `resolveAgentRuntimeState`.
 *
 * A transfer is projected from a destination execution once it runs or
 * settles; a PENDING execution projects to FAILED, as it always has.
 */
export const AGENT_RUN_VOCABULARY: Readonly<
  Record<WorkflowExecutionStatus, AgentRunVocabularyRow>
> = {
  [WorkflowExecutionStatus.PENDING]: {
    runtimeState: AgentRuntimeState.RUNNING,
    threadRunStatus: 'running',
    transferStatus: AgentTransferStatus.FAILED,
  },
  [WorkflowExecutionStatus.RUNNING]: {
    runtimeState: AgentRuntimeState.RUNNING,
    threadRunStatus: 'running',
    transferStatus: AgentTransferStatus.RUNNING,
  },
  [WorkflowExecutionStatus.COMPLETED]: {
    runtimeState: AgentRuntimeState.COMPLETED,
    threadRunStatus: 'completed',
    transferStatus: AgentTransferStatus.COMPLETED,
  },
  [WorkflowExecutionStatus.FAILED]: {
    runtimeState: AgentRuntimeState.FAILED,
    threadRunStatus: 'failed',
    transferStatus: AgentTransferStatus.FAILED,
  },
  [WorkflowExecutionStatus.CANCELLED]: {
    runtimeState: AgentRuntimeState.CANCELLED,
    threadRunStatus: 'cancelled',
    transferStatus: AgentTransferStatus.CANCELLED,
  },
};

/** The thread list `runStatus` each runtime state is shown as. */
export const AGENT_RUNTIME_STATE_THREAD_RUN_STATUS: Readonly<
  Record<AgentRuntimeState, AgentThreadRunStatus>
> = {
  [AgentRuntimeState.READY]: 'idle',
  [AgentRuntimeState.RUNNING]: 'running',
  [AgentRuntimeState.AWAITING_INPUT]: 'waiting_input',
  [AgentRuntimeState.AWAITING_CONFIRMATION]: 'waiting_input',
  [AgentRuntimeState.COMPLETED]: 'completed',
  [AgentRuntimeState.FAILED]: 'failed',
  [AgentRuntimeState.CANCELLED]: 'cancelled',
  [AgentRuntimeState.INTERRUPTED]: 'cancelled',
  [AgentRuntimeState.RESTORING]: 'idle',
};

/** Thread list run statuses that end the turn. */
export const AGENT_THREAD_RUN_TERMINAL_STATUSES: ReadonlySet<AgentThreadRunStatus> =
  new Set<AgentThreadRunStatus>(['completed', 'failed', 'cancelled']);

export function isTerminalAgentThreadRunStatus(
  status: AgentThreadRunStatus | undefined,
): boolean {
  return status !== undefined && AGENT_THREAD_RUN_TERMINAL_STATUSES.has(status);
}

/**
 * The agent transfer status for a destination execution's persisted status.
 * Anything that is not an execution status projects to FAILED.
 */
export function projectAgentTransferStatus(
  status: string,
): AgentTransferStatus {
  return isWorkflowExecutionStatus(status)
    ? AGENT_RUN_VOCABULARY[status].transferStatus
    : AgentTransferStatus.FAILED;
}
