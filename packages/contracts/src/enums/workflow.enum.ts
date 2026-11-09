import { defineStateMachine } from './state-machine.util';

export enum WorkflowTrigger {
  MANUAL = 'manual',
  ON_VIDEO_COMPLETE = 'on-video-complete',
  ON_IMAGE_COMPLETE = 'on-image-complete',
  SCHEDULED = 'scheduled',
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RUNNING = 'running',
}

export enum WorkflowRecurrenceType {
  ONCE = 'once',
  EVERY_30_MIN = 'every-30-min',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum WorkflowLifecycle {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/**
 * Workflow execution lifecycle. Values match Prisma
 * `WorkflowExecutionStatus` (SCREAMING_SNAKE).
 * @see packages/prisma/prisma/schema.prisma `enum WorkflowExecutionStatus`
 */
export enum WorkflowExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Legal execution status edges, as written by the API today (#9734):
 *
 * - `createExecution` inserts PENDING.
 * - `startExecution` moves PENDING, RUNNING (a resumed run re-enters the
 *   graph) or FAILED (a BullMQ retry continues the same execution) to
 *   RUNNING. COMPLETED and CANCELLED never restart.
 * - `completeExecution` and `cancelExecution` settle PENDING or RUNNING.
 *
 * Writers stay compare-and-set: `sourcesOf(to)` is the `status: { in }` list.
 */
export const WORKFLOW_EXECUTION_STATE_MACHINE =
  defineStateMachine<WorkflowExecutionStatus>({
    terminal: [
      WorkflowExecutionStatus.COMPLETED,
      WorkflowExecutionStatus.FAILED,
      WorkflowExecutionStatus.CANCELLED,
    ],
    transitions: {
      [WorkflowExecutionStatus.PENDING]: [
        WorkflowExecutionStatus.RUNNING,
        WorkflowExecutionStatus.COMPLETED,
        WorkflowExecutionStatus.FAILED,
        WorkflowExecutionStatus.CANCELLED,
      ],
      [WorkflowExecutionStatus.RUNNING]: [
        WorkflowExecutionStatus.RUNNING,
        WorkflowExecutionStatus.COMPLETED,
        WorkflowExecutionStatus.FAILED,
        WorkflowExecutionStatus.CANCELLED,
      ],
      [WorkflowExecutionStatus.COMPLETED]: [],
      [WorkflowExecutionStatus.FAILED]: [WorkflowExecutionStatus.RUNNING],
      [WorkflowExecutionStatus.CANCELLED]: [],
    },
  });

/**
 * Statuses that end an execution's run, for polling, ETA display and
 * orchestration. FAILED is terminal for display even though a retry may move
 * it back to RUNNING.
 */
export const WORKFLOW_EXECUTION_TERMINAL_STATUSES: ReadonlySet<WorkflowExecutionStatus> =
  WORKFLOW_EXECUTION_STATE_MACHINE.terminal;

const WORKFLOW_EXECUTION_TERMINAL_VALUES: ReadonlySet<string> =
  WORKFLOW_EXECUTION_TERMINAL_STATUSES;

/**
 * Accepts the contracts enum and the persisted Prisma label alike (both are
 * SCREAMING_SNAKE). Lowercase wire values go through
 * `parseWorkflowExecutionStatus` first.
 */
export function isTerminalWorkflowExecutionStatus(
  status: WorkflowExecutionStatus | `${WorkflowExecutionStatus}`,
): boolean {
  return WORKFLOW_EXECUTION_TERMINAL_VALUES.has(status);
}

const WORKFLOW_EXECUTION_STATUS_VALUES: ReadonlySet<string> = new Set(
  Object.values(WorkflowExecutionStatus),
);

export function isWorkflowExecutionStatus(
  value: string,
): value is WorkflowExecutionStatus {
  return WORKFLOW_EXECUTION_STATUS_VALUES.has(value);
}

/**
 * Reads a persisted or wire execution status in any casing (`completed`,
 * `COMPLETED`). Returns null for anything that is not an execution status.
 */
export function parseWorkflowExecutionStatus(
  value: unknown,
): WorkflowExecutionStatus | null {
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase();
  return isWorkflowExecutionStatus(upper) ? upper : null;
}

/**
 * Named sub-states that live inside one persisted status. They are not column
 * values: AWAITING_REVIEW is a RUNNING execution whose
 * `result.metadata.pendingApproval` names a review gate waiting for a person.
 */
export enum WorkflowExecutionSubState {
  AWAITING_REVIEW = 'awaiting_review',
}

export const WORKFLOW_EXECUTION_SUB_STATE_PARENT: Readonly<
  Record<WorkflowExecutionSubState, WorkflowExecutionStatus>
> = {
  [WorkflowExecutionSubState.AWAITING_REVIEW]: WorkflowExecutionStatus.RUNNING,
};

export enum WorkflowExecutionTrigger {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
  EVENT = 'event',
  API = 'api',
}

/**
 * Auth mode for a workflow's public inbound webhook trigger
 * (`POST /v1/webhooks/:webhookId`). Persisted as a plain string inside the
 * workflow's JSON `config` blob (not a Prisma enum column), so the trigger
 * endpoint must still validate a stored value against this enum at read
 * time and reject anything else — see genfeedai/genfeed.ai#5248.
 */
export enum WorkflowWebhookAuthType {
  NONE = 'none',
  SECRET = 'secret',
  BEARER = 'bearer',
}
