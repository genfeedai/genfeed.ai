import { describe, expect, it } from 'vitest';
import {
  isTerminalWorkflowExecutionStatus,
  parseWorkflowExecutionStatus,
  WORKFLOW_EXECUTION_STATE_MACHINE,
  WORKFLOW_EXECUTION_SUB_STATE_PARENT,
  WorkflowExecutionStatus,
  WorkflowExecutionSubState,
} from './workflow.enum';

const { CANCELLED, COMPLETED, FAILED, PENDING, RUNNING } =
  WorkflowExecutionStatus;

describe('isTerminalWorkflowExecutionStatus', () => {
  it.each([
    [PENDING, false],
    [RUNNING, false],
    [COMPLETED, true],
    [FAILED, true],
    [CANCELLED, true],
  ])('%s is terminal: %s', (status, expected) => {
    expect(isTerminalWorkflowExecutionStatus(status)).toBe(expected);
  });

  it('does not match lowercase wire values', () => {
    expect(
      isTerminalWorkflowExecutionStatus('completed' as WorkflowExecutionStatus),
    ).toBe(false);
  });
});

describe('WORKFLOW_EXECUTION_STATE_MACHINE', () => {
  it.each([
    [PENDING, [RUNNING, COMPLETED, FAILED, CANCELLED]],
    [RUNNING, [RUNNING, COMPLETED, FAILED, CANCELLED]],
    [COMPLETED, []],
    [FAILED, [RUNNING]],
    [CANCELLED, []],
  ])('%s may move to %j', (from, expected) => {
    expect(WORKFLOW_EXECUTION_STATE_MACHINE.next(from)).toEqual(expected);
  });

  it.each([
    // startExecution: fresh run, resumed run, BullMQ retry of a failed run.
    [RUNNING, [PENDING, RUNNING, FAILED]],
    // completeExecution / cancelExecution compare-and-set lists.
    [COMPLETED, [PENDING, RUNNING]],
    [FAILED, [PENDING, RUNNING]],
    [CANCELLED, [PENDING, RUNNING]],
  ])('writers may set %s from %j', (to, expected) => {
    expect(WORKFLOW_EXECUTION_STATE_MACHINE.sourcesOf(to)).toEqual(expected);
  });

  it('never restarts a completed or cancelled execution', () => {
    expect(WORKFLOW_EXECUTION_STATE_MACHINE.can(COMPLETED, RUNNING)).toBe(
      false,
    );
    expect(WORKFLOW_EXECUTION_STATE_MACHINE.can(CANCELLED, RUNNING)).toBe(
      false,
    );
  });

  it('models a waiting review gate as a RUNNING sub-state', () => {
    expect(
      WORKFLOW_EXECUTION_SUB_STATE_PARENT[
        WorkflowExecutionSubState.AWAITING_REVIEW
      ],
    ).toBe(RUNNING);
  });
});

describe('parseWorkflowExecutionStatus', () => {
  it.each([
    ['COMPLETED', COMPLETED],
    ['completed', COMPLETED],
    ['Running', RUNNING],
    ['waiting_input', null],
    [undefined, null],
    [42, null],
  ])('reads %j as %j', (value, expected) => {
    expect(parseWorkflowExecutionStatus(value)).toBe(expected);
  });
});
