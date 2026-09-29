import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { isTerminalBatchStatus } from '@/features/workflows/utils/batch-status';

describe('isTerminalBatchStatus', () => {
  it('treats running as non-terminal', () =>
    expect(isTerminalBatchStatus(WorkflowExecutionStatus.RUNNING)).toBe(false));
});
