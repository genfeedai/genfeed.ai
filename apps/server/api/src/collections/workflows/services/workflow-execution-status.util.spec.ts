import { mapEngineNodeStatus } from '@api/collections/workflows/services/workflow-execution-status.util';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('mapEngineNodeStatus', () => {
  it('maps engine labels onto Prisma execution statuses', () => {
    expect(mapEngineNodeStatus('pending')).toBe(
      WorkflowExecutionStatus.PENDING,
    );
    expect(mapEngineNodeStatus('RUNNING')).toBe(
      WorkflowExecutionStatus.RUNNING,
    );
    expect(mapEngineNodeStatus('processing')).toBe(
      WorkflowExecutionStatus.RUNNING,
    );
    expect(mapEngineNodeStatus('completed')).toBe(
      WorkflowExecutionStatus.COMPLETED,
    );
    expect(mapEngineNodeStatus('skipped')).toBe(
      WorkflowExecutionStatus.COMPLETED,
    );
    expect(mapEngineNodeStatus('failed')).toBe(WorkflowExecutionStatus.FAILED);
    expect(mapEngineNodeStatus('cancelled')).toBe(
      WorkflowExecutionStatus.CANCELLED,
    );
    expect(mapEngineNodeStatus('canceled')).toBe(
      WorkflowExecutionStatus.CANCELLED,
    );
    expect(mapEngineNodeStatus('unknown')).toBe(
      WorkflowExecutionStatus.PENDING,
    );
  });
});
