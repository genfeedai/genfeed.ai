import {
  parseWorkflowExecutionRetention,
  resolveBackgroundRunPurgeAt,
  resolveRunRetention,
  SystemWorkflowRetention,
  WORKFLOW_EXECUTION_RETENTION_METADATA_KEY,
} from '@api/collections/workflows/workflow-execution-retention.contract';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
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

  it.each([
    ['background', true, '2026-11-17T10:00:00.000Z'],
    ['background', false, '2026-11-30T10:00:00.000Z'],
    ['kept', true, null],
    [null, false, null],
  ])(
    'purges a %s run (success: %s) at %s',
    (retentionPolicy, isSuccess, expected) => {
      const purgeAt = resolveBackgroundRunPurgeAt(retentionPolicy, {
        completedAt: new Date('2026-11-16T10:00:00.000Z'),
        isSuccess,
      });
      expect(purgeAt?.toISOString() ?? null).toBe(expected);
    },
  );

  it.each([
    [
      SystemWorkflowRetention.BACKGROUND,
      SystemWorkflowDispatchClass.BACKGROUND,
      'background',
    ],
    [
      SystemWorkflowRetention.BACKGROUND,
      SystemWorkflowDispatchClass.SCHEDULED_PUBLISH,
      'background',
    ],
    [SystemWorkflowRetention.BACKGROUND, undefined, 'background'],
    [
      SystemWorkflowRetention.BACKGROUND,
      SystemWorkflowDispatchClass.INTERACTIVE,
      'kept',
    ],
    [
      SystemWorkflowRetention.KEPT,
      SystemWorkflowDispatchClass.BACKGROUND,
      'kept',
    ],
  ])(
    'keeps what a %s workflow dispatched as %s has: %s',
    (definitionRetention, dispatchClass, expected) => {
      expect(resolveRunRetention(definitionRetention, dispatchClass)).toBe(
        expected,
      );
    },
  );
});
