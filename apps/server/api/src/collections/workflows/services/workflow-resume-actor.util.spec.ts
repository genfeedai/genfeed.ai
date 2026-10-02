import { requireRecordedWorkflowActor } from '@api/collections/workflows/services/workflow-resume-actor.util';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { describe, expect, it } from 'vitest';

describe('requireRecordedWorkflowActor', () => {
  it.each([undefined, null, 42, {}, [], '', ' \t\n'])(
    'blocks an invalid recorded actor %j with the execution identity',
    (actor) => {
      expect(() =>
        requireRecordedWorkflowActor('execution-corrupt', actor),
      ).toThrow(
        'Workflow execution execution-corrupt has no recorded actor; resume is blocked.',
      );
    },
  );

  it.each(['opaque-user-id', ' recorded-actor ', SYSTEM_WORKFLOW_PRINCIPAL_ID])(
    'preserves a nonempty opaque actor byte for byte: %s',
    (actor) => {
      expect(requireRecordedWorkflowActor('execution-valid', actor)).toBe(
        actor,
      );
    },
  );
});
