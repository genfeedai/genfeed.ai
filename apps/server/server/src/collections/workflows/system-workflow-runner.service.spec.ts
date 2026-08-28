import { describe, expect, it } from 'vitest';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from './system-workflow-runner.service';

const definition: SystemWorkflowGraphDefinition = {
  canonicalId: 'clip-hook-review',
  definition: { edges: [], nodes: [] },
  description: 'Review one generated hook clip.',
  label: 'Clip Hook Review',
  resultNodeId: 'review-hook',
};

describe('SystemWorkflowRunnerService definitions', () => {
  const service = new SystemWorkflowRunnerService({} as never, {} as never);
  const mismatchedInput = {
    actionType: 'clip-hook-review',
    canonicalId: 'different-workflow',
    organizationId: 'org-1',
    source: 'clip-generation',
    userId: 'user-1',
  };

  it('rejects a mismatched completed workflow identity', async () => {
    await expect(
      service.runWorkflowDefinition(definition, mismatchedInput),
    ).rejects.toThrow(
      'System workflow definition clip-hook-review cannot execute as different-workflow',
    );
  });

  it('rejects a mismatched pausable workflow identity', async () => {
    await expect(
      service.startWorkflowDefinition(definition, mismatchedInput),
    ).rejects.toThrow(
      'System workflow definition clip-hook-review cannot execute as different-workflow',
    );
  });
});
