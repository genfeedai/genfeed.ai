import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_NODE_CONTINUATION_ACTIVE_STATUSES,
  WORKFLOW_NODE_CONTINUATION_PROVIDER_SETTLED_STATUSES,
  WORKFLOW_NODE_CONTINUATION_STATE_MACHINE,
  WORKFLOW_NODE_CONTINUATION_SUBMISSION_STATUSES,
  WorkflowNodeContinuationStatus,
} from './workflow-node-continuation.enum';

const {
  COMPLETED,
  FAILED,
  PENDING_SUBMISSION,
  PROVIDER_FAILED,
  PROVIDER_SUCCEEDED,
  RESUMING,
  WAITING_PROVIDER,
} = WorkflowNodeContinuationStatus;
const machine = WORKFLOW_NODE_CONTINUATION_STATE_MACHINE;

describe('WORKFLOW_NODE_CONTINUATION_STATE_MACHINE', () => {
  it.each([
    [
      PENDING_SUBMISSION,
      [WAITING_PROVIDER, PROVIDER_SUCCEEDED, PROVIDER_FAILED, RESUMING, FAILED],
    ],
    [
      WAITING_PROVIDER,
      [WAITING_PROVIDER, PROVIDER_SUCCEEDED, PROVIDER_FAILED, RESUMING, FAILED],
    ],
    [PROVIDER_SUCCEEDED, [PROVIDER_SUCCEEDED, RESUMING]],
    [PROVIDER_FAILED, [PROVIDER_SUCCEEDED, RESUMING]],
    [RESUMING, [PROVIDER_SUCCEEDED, RESUMING, COMPLETED, FAILED]],
    [COMPLETED, []],
    [FAILED, []],
  ])('%s may move to %j', (from, expected) => {
    expect(machine.next(from)).toEqual(expected);
  });

  it.each([
    // finishWorkflowContinuationSettlement only finishes a RESUMING lease.
    [COMPLETED, [RESUMING]],
    [FAILED, [PENDING_SUBMISSION, WAITING_PROVIDER, RESUMING]],
    // recordProviderSettlement ignores rows the provider already answered.
    [PROVIDER_FAILED, [PENDING_SUBMISSION, WAITING_PROVIDER]],
  ])('writers may set %s from %j', (to, expected) => {
    expect(machine.sourcesOf(to)).toEqual(expected);
  });

  it('treats every non-terminal status as owning the suspended node', () => {
    expect(WORKFLOW_NODE_CONTINUATION_ACTIVE_STATUSES).toEqual([
      PENDING_SUBMISSION,
      WAITING_PROVIDER,
      PROVIDER_SUCCEEDED,
      PROVIDER_FAILED,
      RESUMING,
    ]);
  });

  it.each([
    [PENDING_SUBMISSION, true],
    [WAITING_PROVIDER, true],
  ])('a failed submission may leave %s: %s', (from, expected) => {
    expect(WORKFLOW_NODE_CONTINUATION_SUBMISSION_STATUSES).toContain(from);
    expect(machine.can(from, FAILED)).toBe(expected);
  });

  it.each([
    [PROVIDER_SUCCEEDED, true],
    [PROVIDER_FAILED, true],
  ])('reconciliation may resume %s: %s', (from, expected) => {
    expect(WORKFLOW_NODE_CONTINUATION_PROVIDER_SETTLED_STATUSES).toContain(
      from,
    );
    expect(machine.can(from, RESUMING)).toBe(expected);
  });
});
