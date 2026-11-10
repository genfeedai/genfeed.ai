import { defineStateMachine } from './state-machine.util';

/**
 * Durable provider-callback continuation of one workflow node. Values match
 * Prisma `WorkflowNodeContinuationStatus` (SCREAMING_SNAKE).
 * @see packages/prisma/prisma/schema.prisma `enum WorkflowNodeContinuationStatus`
 */
export enum WorkflowNodeContinuationStatus {
  PENDING_SUBMISSION = 'PENDING_SUBMISSION',
  WAITING_PROVIDER = 'WAITING_PROVIDER',
  PROVIDER_SUCCEEDED = 'PROVIDER_SUCCEEDED',
  PROVIDER_FAILED = 'PROVIDER_FAILED',
  RESUMING = 'RESUMING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Legal continuation edges, as written by `WorkflowNodeContinuationService`
 * and `finishWorkflowContinuationSettlement` (#9734):
 *
 * - A submission is created PENDING_SUBMISSION, then the provider accepts it
 *   (WAITING_PROVIDER) or rejects it (FAILED).
 * - A provider callback records PROVIDER_SUCCEEDED / PROVIDER_FAILED, or claims
 *   the resume lease (RESUMING) once the node's initial output is attached.
 *   A late success callback without initial output may still record
 *   PROVIDER_SUCCEEDED over PROVIDER_FAILED or an expired RESUMING lease.
 * - An expired RESUMING lease may be claimed again (RESUMING → RESUMING).
 * - Finishing the settlement moves RESUMING to COMPLETED or FAILED.
 *
 * Every writer compares the row's current status in its `where`.
 */
export const WORKFLOW_NODE_CONTINUATION_STATE_MACHINE =
  defineStateMachine<WorkflowNodeContinuationStatus>({
    terminal: [
      WorkflowNodeContinuationStatus.COMPLETED,
      WorkflowNodeContinuationStatus.FAILED,
    ],
    transitions: {
      [WorkflowNodeContinuationStatus.PENDING_SUBMISSION]: [
        WorkflowNodeContinuationStatus.WAITING_PROVIDER,
        WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED,
        WorkflowNodeContinuationStatus.PROVIDER_FAILED,
        WorkflowNodeContinuationStatus.RESUMING,
        WorkflowNodeContinuationStatus.FAILED,
      ],
      [WorkflowNodeContinuationStatus.WAITING_PROVIDER]: [
        WorkflowNodeContinuationStatus.WAITING_PROVIDER,
        WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED,
        WorkflowNodeContinuationStatus.PROVIDER_FAILED,
        WorkflowNodeContinuationStatus.RESUMING,
        WorkflowNodeContinuationStatus.FAILED,
      ],
      [WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED]: [
        WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED,
        WorkflowNodeContinuationStatus.RESUMING,
      ],
      [WorkflowNodeContinuationStatus.PROVIDER_FAILED]: [
        WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED,
        WorkflowNodeContinuationStatus.RESUMING,
      ],
      [WorkflowNodeContinuationStatus.RESUMING]: [
        WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED,
        WorkflowNodeContinuationStatus.RESUMING,
        WorkflowNodeContinuationStatus.COMPLETED,
        WorkflowNodeContinuationStatus.FAILED,
      ],
      [WorkflowNodeContinuationStatus.COMPLETED]: [],
      [WorkflowNodeContinuationStatus.FAILED]: [],
    },
  });

/** A node that still owns its suspended provider submission. */
export const WORKFLOW_NODE_CONTINUATION_ACTIVE_STATUSES: readonly WorkflowNodeContinuationStatus[] =
  WORKFLOW_NODE_CONTINUATION_STATE_MACHINE.states.filter(
    (status) => !WORKFLOW_NODE_CONTINUATION_STATE_MACHINE.isTerminal(status),
  );

/** A submission the provider has not answered yet, so it can still be failed. */
export const WORKFLOW_NODE_CONTINUATION_SUBMISSION_STATUSES: readonly WorkflowNodeContinuationStatus[] =
  [
    WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
    WorkflowNodeContinuationStatus.WAITING_PROVIDER,
  ];

/** The provider answered, but the node has not resumed yet. */
export const WORKFLOW_NODE_CONTINUATION_PROVIDER_SETTLED_STATUSES: readonly WorkflowNodeContinuationStatus[] =
  [
    WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED,
    WorkflowNodeContinuationStatus.PROVIDER_FAILED,
  ];
