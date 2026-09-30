import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { isTerminalExecutionStatus } from '@/features/workflows/utils/execution-status';

describe('isTerminalExecutionStatus', () => {
  it('treats completed as terminal', () =>
    expect(isTerminalExecutionStatus(WorkflowExecutionStatus.COMPLETED)).toBe(
      true,
    ));
  it('treats failed as terminal', () =>
    expect(isTerminalExecutionStatus(WorkflowExecutionStatus.FAILED)).toBe(
      true,
    ));
  it('treats cancelled as terminal', () =>
    expect(isTerminalExecutionStatus(WorkflowExecutionStatus.CANCELLED)).toBe(
      true,
    ));
  it('treats pending as non-terminal', () =>
    expect(isTerminalExecutionStatus(WorkflowExecutionStatus.PENDING)).toBe(
      false,
    ));
  it('treats running as non-terminal', () =>
    expect(isTerminalExecutionStatus(WorkflowExecutionStatus.RUNNING)).toBe(
      false,
    ));
});
