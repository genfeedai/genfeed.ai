import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { isTerminalBatchStatus } from '@/features/workflows/utils/batch-status';

describe('isTerminalBatchStatus', () => {
  it('treats completed as terminal', () =>
    expect(isTerminalBatchStatus(WorkflowExecutionStatus.COMPLETED)).toBe(
      true,
    ));
  it('treats failed as terminal', () =>
    expect(isTerminalBatchStatus(WorkflowExecutionStatus.FAILED)).toBe(true));
  it('treats cancelled as terminal', () =>
    expect(isTerminalBatchStatus(WorkflowExecutionStatus.CANCELLED)).toBe(
      true,
    ));
  it('treats pending as non-terminal', () =>
    expect(isTerminalBatchStatus(WorkflowExecutionStatus.PENDING)).toBe(false));
  it('treats running as non-terminal', () =>
    expect(isTerminalBatchStatus(WorkflowExecutionStatus.RUNNING)).toBe(false));
});
