import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { isTerminalExecutionStatus } from '@/features/workflows/utils/execution-status';

describe('isTerminalExecutionStatus', () => {
  it('treats running as non-terminal', () =>
    expect(isTerminalExecutionStatus(WorkflowExecutionStatus.RUNNING)).toBe(
      false,
    ));
});
