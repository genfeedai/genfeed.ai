/**
 * Product-language run envelope for agent turns (#3999 FR-1).
 *
 * This is not a Prisma enum. Durable execution stays
 * `WorkflowExecutionStatus` (SCREAMING). Snapshot JSON still stores the
 * historical `queued` / `waiting_input` spellings; map them through
 * `resolveAgentRuntimeState` before rendering or listing.
 */
export enum AgentRuntimeState {
  READY = 'ready',
  RUNNING = 'running',
  AWAITING_INPUT = 'awaiting_input',
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  INTERRUPTED = 'interrupted',
  RESTORING = 'restoring',
}

export const AGENT_RUNTIME_STATE_LABELS: Record<AgentRuntimeState, string> = {
  [AgentRuntimeState.READY]: 'Ready',
  [AgentRuntimeState.RUNNING]: 'Running',
  [AgentRuntimeState.AWAITING_INPUT]: 'Awaiting input',
  [AgentRuntimeState.AWAITING_CONFIRMATION]: 'Awaiting confirmation',
  [AgentRuntimeState.COMPLETED]: 'Completed',
  [AgentRuntimeState.FAILED]: 'Failed',
  [AgentRuntimeState.CANCELLED]: 'Cancelled',
  [AgentRuntimeState.INTERRUPTED]: 'Interrupted',
  [AgentRuntimeState.RESTORING]: 'Restoring',
};

export const AGENT_RUNTIME_TERMINAL_STATES: ReadonlySet<AgentRuntimeState> =
  new Set([
    AgentRuntimeState.COMPLETED,
    AgentRuntimeState.FAILED,
    AgentRuntimeState.CANCELLED,
    AgentRuntimeState.INTERRUPTED,
  ]);

export const AGENT_RUNTIME_ACTIVE_STATES: ReadonlySet<AgentRuntimeState> =
  new Set([
    AgentRuntimeState.RUNNING,
    AgentRuntimeState.AWAITING_INPUT,
    AgentRuntimeState.AWAITING_CONFIRMATION,
    AgentRuntimeState.RESTORING,
  ]);

export interface AgentRuntimeStateInput {
  hasPendingConfirmation?: boolean;
  isRestoring?: boolean;
  pendingInputCount?: number;
  snapshotStatus?: string | null;
  workflowStatus?: string | null;
}

const TERMINAL_SOURCE_STATUSES = new Set([
  'completed',
  'COMPLETED',
  'failed',
  'FAILED',
  'cancelled',
  'CANCELLED',
  'interrupted',
  'INTERRUPTED',
  'BUDGET_EXHAUSTED',
]);

function readSourceStatus(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mapSourceStatus(value?: string | null): AgentRuntimeState | null {
  const status = readSourceStatus(value);
  if (!status) {
    return null;
  }

  switch (status) {
    case AgentRuntimeState.READY:
    case 'idle':
      return AgentRuntimeState.READY;
    case AgentRuntimeState.RUNNING:
    case 'queued':
    case 'PENDING':
    case 'RUNNING':
    case 'cancelling':
      return AgentRuntimeState.RUNNING;
    case AgentRuntimeState.AWAITING_INPUT:
    case 'waiting_input':
    case 'waiting-input':
      return AgentRuntimeState.AWAITING_INPUT;
    case AgentRuntimeState.AWAITING_CONFIRMATION:
    case 'awaiting_approval':
      return AgentRuntimeState.AWAITING_CONFIRMATION;
    case AgentRuntimeState.COMPLETED:
    case 'COMPLETED':
      return AgentRuntimeState.COMPLETED;
    case AgentRuntimeState.FAILED:
    case 'FAILED':
    case 'BUDGET_EXHAUSTED':
      return AgentRuntimeState.FAILED;
    case AgentRuntimeState.CANCELLED:
    case 'CANCELLED':
      return AgentRuntimeState.CANCELLED;
    case AgentRuntimeState.INTERRUPTED:
    case 'INTERRUPTED':
      return AgentRuntimeState.INTERRUPTED;
    case AgentRuntimeState.RESTORING:
      return AgentRuntimeState.RESTORING;
    default:
      return null;
  }
}

function isTerminalSourceStatus(value?: string | null): boolean {
  return TERMINAL_SOURCE_STATUSES.has(readSourceStatus(value));
}

/**
 * Collapse snapshot JSON, pending input/confirmation, and the latest
 * workflow execution into one FR-1 state. Terminal durable state always
 * wins over a stale `running` / `queued` projection.
 */
export function resolveAgentRuntimeState(
  input: AgentRuntimeStateInput,
): AgentRuntimeState {
  if (input.isRestoring) {
    return AgentRuntimeState.RESTORING;
  }

  if ((input.pendingInputCount ?? 0) > 0) {
    return AgentRuntimeState.AWAITING_INPUT;
  }

  if (input.hasPendingConfirmation) {
    return AgentRuntimeState.AWAITING_CONFIRMATION;
  }

  const snapshotState = mapSourceStatus(input.snapshotStatus);
  const workflowState = mapSourceStatus(input.workflowStatus);
  const snapshotIsLive =
    snapshotState === AgentRuntimeState.RUNNING ||
    snapshotState === AgentRuntimeState.READY;
  const workflowIsTerminal =
    workflowState !== null && AGENT_RUNTIME_TERMINAL_STATES.has(workflowState);

  if (snapshotIsLive && workflowIsTerminal && workflowState) {
    return workflowState;
  }

  if (snapshotState && AGENT_RUNTIME_TERMINAL_STATES.has(snapshotState)) {
    return snapshotState;
  }

  if (workflowState && AGENT_RUNTIME_TERMINAL_STATES.has(workflowState)) {
    return workflowState;
  }

  if (snapshotState) {
    return snapshotState;
  }

  if (workflowState) {
    return workflowState;
  }

  return AgentRuntimeState.READY;
}

export function isAgentRuntimeTerminalState(state: AgentRuntimeState): boolean {
  return AGENT_RUNTIME_TERMINAL_STATES.has(state);
}

export function formatAgentRuntimeStateLabel(state: AgentRuntimeState): string {
  return AGENT_RUNTIME_STATE_LABELS[state];
}

export function isStaleRunningProjection(input: {
  renderedState: AgentRuntimeState;
  snapshotStatus?: string | null;
  workflowStatus?: string | null;
}): boolean {
  if (input.renderedState !== AgentRuntimeState.RUNNING) {
    return false;
  }

  return (
    isTerminalSourceStatus(input.snapshotStatus) ||
    isTerminalSourceStatus(input.workflowStatus)
  );
}
