import {
  parseWorkflowExecutionRetention,
  WORKFLOW_EXECUTION_RETENTION_METADATA_KEY,
} from '@api/collections/workflows/workflow-execution-retention.contract';
import { describe, expect, it } from 'vitest';

describe('workflow execution retention contract', () => {
  it('defaults to durable execution payloads', () => {
    expect(parseWorkflowExecutionRetention({})).toEqual({
      purgeAfterHours: null,
      scrubAllNodePayloads: false,
      scrubNodeIds: [],
    });
  });

  it('creates a bounded purge deadline for fully scrubbed executions', () => {
    expect(
      parseWorkflowExecutionRetention({
        [WORKFLOW_EXECUTION_RETENTION_METADATA_KEY]: {
          purgeAfterHours: 24,
          scrubNodePayloads: 'all',
        },
      }),
    ).toEqual({
      purgeAfterHours: 24,
      scrubAllNodePayloads: true,
      scrubNodeIds: [],
    });
  });

  it('rejects purge without complete terminal scrubbing', () => {
    expect(() =>
      parseWorkflowExecutionRetention({
        [WORKFLOW_EXECUTION_RETENTION_METADATA_KEY]: {
          purgeAfterHours: 2,
          scrubNodePayloads: ['obtain-transcript'],
        },
      }),
    ).toThrow('must scrub all node payloads');
  });
});
