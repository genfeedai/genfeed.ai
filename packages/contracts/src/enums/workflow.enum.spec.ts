import { describe, expect, it } from 'vitest';
import {
  isTerminalWorkflowExecutionStatus,
  WorkflowExecutionStatus,
} from './workflow.enum';

describe('isTerminalWorkflowExecutionStatus', () => {
  it.each([
    [WorkflowExecutionStatus.PENDING, false],
    [WorkflowExecutionStatus.RUNNING, false],
    [WorkflowExecutionStatus.COMPLETED, true],
    [WorkflowExecutionStatus.FAILED, true],
    [WorkflowExecutionStatus.CANCELLED, true],
  ])('%s is terminal: %s', (status, expected) => {
    expect(isTerminalWorkflowExecutionStatus(status)).toBe(expected);
  });

  it('does not match lowercase wire values', () => {
    expect(
      isTerminalWorkflowExecutionStatus('completed' as WorkflowExecutionStatus),
    ).toBe(false);
  });
});
